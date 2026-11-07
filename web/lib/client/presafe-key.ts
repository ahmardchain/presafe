// Browser-held Presafe key. The customer's NEAR account is the 64-hex implicit account derived
// from this key; the relayer creates it with a little testnet NEAR. Every action is signed here
// as a NEP-366 delegate action and submitted by the relayer, so the customer pays no gas and
// sees no wallet popup. Losing the key (clearing browser data) loses access to the receipts,
// so the claims page offers a key export.
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  actions,
  encodeSignedDelegate,
  keyToImplicitAddress,
  nearToYocto,
  teraToGas,
  type KeyPairString,
} from "near-api-js";
import { PRESAFE_CONTRACT, RPC_URL, USDC_CONTRACT } from "@/lib/config";

const STORE = "presafe.key.v1";
const provider = new JsonRpcProvider({ url: RPC_URL });

export interface PresafeKey {
  accountId: string;
  keyPair: KeyPair;
}

export function loadKey(): PresafeKey | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const keyPair = KeyPair.fromString(raw as KeyPairString);
    return { keyPair, accountId: keyToImplicitAddress(keyPair.getPublicKey()) };
  } catch {
    return null;
  }
}

export function createKey(): PresafeKey {
  const keyPair = KeyPair.fromRandom("ed25519");
  try {
    localStorage.setItem(STORE, keyPair.toString());
  } catch {
    /* private mode: the key lives for this page only */
  }
  return { keyPair, accountId: keyToImplicitAddress(keyPair.getPublicKey()) };
}

export function importKey(secret: string): PresafeKey {
  const keyPair = KeyPair.fromString(secret.trim() as KeyPairString);
  localStorage.setItem(STORE, keyPair.toString());
  return { keyPair, accountId: keyToImplicitAddress(keyPair.getPublicKey()) };
}

export const exportKey = (k: PresafeKey) => k.keyPair.toString();

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `${path} failed (${res.status})`);
  return json;
}

async function exists(accountId: string) {
  try {
    await provider.viewAccount({ accountId });
    return true;
  } catch {
    return false;
  }
}

/** Makes sure the implicit account exists on chain (the relayer funds it on testnet). */
export async function ensureAccount(k: PresafeKey): Promise<void> {
  if (await exists(k.accountId)) return;
  await post("/api/onboard", { accountId: k.accountId });
  for (let i = 0; i < 20; i++) {
    if (await exists(k.accountId)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("account was not created in time");
}

type FnAction = ReturnType<typeof actions.functionCall>;

/** Signs a delegate action locally and asks the relayer to submit it. Returns the tx hash. */
export async function signAndRelay(k: PresafeKey, receiverId: string, acts: FnAction[]): Promise<string> {
  await ensureAccount(k);
  const account = new Account(k.accountId, provider, k.keyPair.toString() as KeyPairString);
  const { signedDelegate } = await account.createSignedMetaTransaction({ receiverId, actions: acts, blockHeightTtl: 120 });
  const bytes = encodeSignedDelegate(signedDelegate);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const out = await post("/api/relay", { signedDelegate: btoa(bin) });
  const failure = JSON.stringify(out.status ?? {}).includes("Failure");
  if (failure) throw new Error(`transaction failed: ${out.hash}`);
  return out.hash as string;
}

/** Testnet: mints test USDC to the customer and pays it into an obligation, in one relayed delegate. */
export async function payWithTestUsdc(k: PresafeKey, obligationId: string, amount: bigint): Promise<string> {
  await ensureAccount(k);
  const registered = await provider
    .callFunction({ contractId: USDC_CONTRACT, method: "storage_balance_of", args: { account_id: k.accountId } })
    .catch(() => null);
  return signAndRelay(k, USDC_CONTRACT, [
    actions.functionCall("mint", { account_id: k.accountId, amount: amount.toString() }, teraToGas(15), registered ? 0n : nearToYocto("0.00125")),
    actions.functionCall(
      "ft_transfer_call",
      { receiver_id: PRESAFE_CONTRACT, amount: amount.toString(), msg: JSON.stringify({ action: "pay", obligation_id: Number(obligationId) }) },
      teraToGas(120),
      1n,
    ),
  ]);
}

export const claim = (k: PresafeKey, receiptId: string) =>
  signAndRelay(k, PRESAFE_CONTRACT, [actions.functionCall("claim", { receipt_id: receiptId }, teraToGas(100), 0n)]);

export const dispute = (k: PresafeKey, receiptId: string) =>
  signAndRelay(k, PRESAFE_CONTRACT, [actions.functionCall("dispute", { receipt_id: receiptId }, teraToGas(30), 0n)]);

export const triggerDefault = (k: PresafeKey, obligationId: string) =>
  signAndRelay(k, PRESAFE_CONTRACT, [actions.functionCall("trigger_default", { obligation_id: obligationId }, teraToGas(30), 0n)]);
