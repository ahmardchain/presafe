// Two ways for a business to sign: a NEAR wallet through NEAR Connect (the real path, and the
// only one on mainnet), or a testnet-only demo key held in this browser and funded with a little
// testnet NEAR by the relayer, so judges can try the business side without a testnet wallet.
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  keyToImplicitAddress,
  type KeyPairString,
} from "near-api-js";
import type { NearConnector } from "@hot-labs/near-connect";
import { NETWORK, RPC_URL } from "@/lib/config";

export interface BizSigner {
  accountId: string;
  kind: "wallet" | "demo";
  call(contractId: string, methodName: string, args: object, deposit: bigint, gas: bigint): Promise<string>;
  disconnect(): Promise<void>;
}

const provider = new JsonRpcProvider({ url: RPC_URL });
const DEMO_STORE = "presafe.business.key.v1";
export const TGAS = 1_000_000_000_000n;

// ---------- NEAR Connect wallet ----------

let connectorPromise: Promise<NearConnector> | null = null;
function connector(): Promise<NearConnector> {
  if (!connectorPromise) {
    connectorPromise = import("@hot-labs/near-connect").then(
      ({ NearConnector }) => new NearConnector({ network: NETWORK === "mainnet" ? "mainnet" : "testnet" }),
    );
  }
  return connectorPromise;
}

function walletSigner(accountId: string, c: NearConnector): BizSigner {
  return {
    accountId,
    kind: "wallet",
    async call(receiverId, methodName, args, deposit, gas) {
      const wallet = await c.wallet();
      const out = await wallet.signAndSendTransaction({
        receiverId,
        actions: [{ type: "FunctionCall", params: { methodName, args, gas: gas.toString(), deposit: deposit.toString() } }],
      });
      return out.transaction.hash;
    },
    async disconnect() {
      await c.disconnect();
    },
  };
}

export async function connectWallet(): Promise<BizSigner> {
  const c = await connector();
  const wallet = await c.connect();
  const accounts = await wallet.getAccounts();
  if (!accounts[0]) throw new Error("the wallet returned no account");
  return walletSigner(accounts[0].accountId, c);
}

/** Restores a wallet connection from a previous visit, if there is one. */
export async function restoreWallet(): Promise<BizSigner | null> {
  try {
    const c = await connector();
    const { accounts } = await c.getConnectedWallet();
    return accounts[0] ? walletSigner(accounts[0].accountId, c) : null;
  } catch {
    return null;
  }
}

// ---------- Testnet demo business key ----------

function demoSigner(keyPair: KeyPair): BizSigner {
  const accountId = keyToImplicitAddress(keyPair.getPublicKey());
  const account = new Account(accountId, provider, keyPair.toString() as KeyPairString);
  return {
    accountId,
    kind: "demo",
    async call(contractId, methodName, args, deposit, gas) {
      const out = await account.callFunctionRaw({ contractId, methodName, args: args as Record<string, unknown>, deposit, gas });
      const status = JSON.stringify(out.status ?? {});
      if (status.includes("Failure")) {
        const m = status.match(/ExecutionError":"([^"]+)/);
        throw new Error(m ? m[1] : `transaction failed: ${out.transaction.hash}`);
      }
      return out.transaction.hash;
    },
    async disconnect() {
      try {
        localStorage.removeItem(DEMO_STORE);
      } catch {}
    },
  };
}

export function restoreDemo(): BizSigner | null {
  if (NETWORK !== "testnet") return null;
  try {
    const raw = localStorage.getItem(DEMO_STORE);
    return raw ? demoSigner(KeyPair.fromString(raw as KeyPairString)) : null;
  } catch {
    return null;
  }
}

export async function startDemo(): Promise<BizSigner> {
  if (NETWORK !== "testnet") throw new Error("demo businesses exist on testnet only");
  const keyPair = KeyPair.fromRandom("ed25519");
  const accountId = keyToImplicitAddress(keyPair.getPublicKey());
  const res = await fetch("/api/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, role: "business" }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "could not create a demo business");
  for (let i = 0; i < 20; i++) {
    try {
      await provider.viewAccount({ accountId });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  try {
    localStorage.setItem(DEMO_STORE, keyPair.toString());
  } catch {}
  return demoSigner(keyPair);
}
