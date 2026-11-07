import "server-only";
// Meta transaction relayer (NEP-366). It pays gas, and the attached deposits of the inner
// actions, only for a short allowlist of calls. Spending limits are enforced here and in the
// contracts, never by access-key allowances (meta transactions do not enforce those).
import { deserialize } from "borsh";
import { Account, JsonRpcProvider, SCHEMA, actions as A, nearToYocto, type SignedDelegate } from "near-api-js";
import { NETWORK, PRESAFE_CONTRACT, RPC_URL, USDC_CONTRACT } from "@/lib/config";

const provider = new JsonRpcProvider({ url: RPC_URL });

function relayer(): Account {
  const id = process.env.RELAYER_ACCOUNT_ID;
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!id || !key) throw new Error("relayer not configured (RELAYER_ACCOUNT_ID, RELAYER_PRIVATE_KEY)");
  return new Account(id, provider, key as `ed25519:${string}`);
}

const TGAS = 1_000_000_000_000n;
const MAX_TOTAL_GAS = 300n * TGAS;
const MINT_DEPOSIT = nearToYocto("0.00125");
const MAX_TEST_MINT = 20_000_000n; // 20 test USDC per relayed mint
const ONBOARD_NEAR = nearToYocto("0.01"); // creates an implicit account (testnet)

type Rule = (args: Record<string, unknown>, sender: string, deposit: bigint) => string | null;

const presafeRules: Record<string, Rule> = {
  claim: (_a, _s, d) => (d === 0n ? null : "claim takes no deposit"),
  dispute: (_a, _s, d) => (d === 0n ? null : "dispute takes no deposit"),
  trigger_default: (_a, _s, d) => (d === 0n ? null : "trigger_default takes no deposit"),
};

const usdcRules: Record<string, Rule> = {
  ft_transfer_call: (a, sender, d) => {
    if (d !== 1n) return "ft_transfer_call needs exactly 1 yoctoNEAR";
    if (a.receiver_id !== PRESAFE_CONTRACT) return "tokens may only go to the Presafe contract";
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(a.msg));
    } catch {
      return "msg must be JSON";
    }
    if (msg.action !== "pay") return "only pay is relayed";
    if (msg.payer !== undefined && msg.payer !== sender) return "payer must be the signer";
    return null;
  },
};
// Test-token faucet: only on testnet, only to the signer, capped.
if (NETWORK === "testnet") {
  usdcRules.mint = (a, sender, d) => {
    if (a.account_id !== sender) return "can only mint to yourself";
    if (d > MINT_DEPOSIT) return "mint deposit too high";
    try {
      if (BigInt(String(a.amount)) > MAX_TEST_MINT) return "mint amount too high";
    } catch {
      return "bad amount";
    }
    return null;
  };
}

const RULES: Record<string, Record<string, Rule>> = {
  [PRESAFE_CONTRACT]: presafeRules,
  [USDC_CONTRACT]: usdcRules,
};

export function decodeSignedDelegate(b64: string): SignedDelegate {
  return deserialize(SCHEMA.SignedDelegate, Buffer.from(b64, "base64")) as unknown as SignedDelegate;
}

/** Returns a reason to refuse, or null if the delegate is within policy. */
export function checkPolicy(sd: SignedDelegate): string | null {
  const da = sd.delegateAction;
  const rules = RULES[da.receiverId];
  if (!rules) return `receiver ${da.receiverId} is not relayed`;
  if (da.actions.length === 0 || da.actions.length > 2) return "1 or 2 actions only";
  let gas = 0n;
  for (const action of da.actions) {
    const fc = action.functionCall;
    if (!fc) return "only function calls are relayed";
    const rule = rules[fc.methodName];
    if (!rule) return `method ${fc.methodName} is not relayed`;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(Buffer.from(fc.args).toString("utf8"));
    } catch {
      return "args must be JSON";
    }
    const why = rule(args, da.senderId, BigInt(fc.deposit));
    if (why) return why;
    gas += BigInt(fc.gas);
  }
  if (gas > MAX_TOTAL_GAS) return "too much gas";
  return null;
}

export async function relay(sd: SignedDelegate) {
  const out = await relayer().relayMetaTransaction(sd);
  return { hash: out.transaction.hash, status: out.status };
}

/** Creates a 64-hex implicit account for a browser key by sending it a little NEAR. Testnet only. */
export async function onboard(accountId: string): Promise<{ created: boolean; hash?: string }> {
  if (NETWORK !== "testnet") throw new Error("onboarding is testnet-only");
  if (!/^[0-9a-f]{64}$/.test(accountId)) throw new Error("not an implicit account id");
  try {
    await provider.viewAccount({ accountId });
    return { created: false };
  } catch {
    const out = await relayer().signAndSendTransaction({ receiverId: accountId, actions: [A.transfer(ONBOARD_NEAR)] });
    return { created: true, hash: out.transaction.hash };
  }
}

// Minimal per-IP rate limit (in memory; enough for a testnet demo).
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs = 3_600_000): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}
