// Testnet only. Keys are generated locally and stored under scripts/state/testnet (git-ignored).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair } from "near-api-js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(here, "..", "..");
export const STATE = path.join(ROOT, "scripts", "state", "testnet");
export const RPC_URL = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
export const FAUCET = "https://helper.nearprotocol.com/account";
export const provider = new JsonRpcProvider({ url: RPC_URL });

// Account names checked free on testnet on 2026-11-06.
export const ACCOUNTS = {
  presafe: "presafe-app.testnet",
  usdc: "presafe-musdc.testnet",
  arbiter: "presafe-arbiter.testnet",
  relayer: "presafe-relayer.testnet",
  business: "lagos-sound-fest.testnet",
  customer: "presafe-demo-customer.testnet",
};
export const WASM = {
  presafe: path.join(ROOT, "contract", "target", "near", "presafe", "presafe.wasm"),
  usdc: path.join(ROOT, "contract", "target", "near", "mock_ft", "mock_ft.wasm"),
};
export const EXECUTE = process.argv.includes("--execute");

fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });

export function keyFor(accountId) {
  const file = path.join(STATE, `${accountId}.json`);
  if (fs.existsSync(file)) return KeyPair.fromString(JSON.parse(fs.readFileSync(file, "utf8")).secretKey);
  const kp = KeyPair.fromRandom("ed25519");
  fs.writeFileSync(file, JSON.stringify({ accountId, publicKey: kp.getPublicKey().toString(), secretKey: kp.toString() }, null, 2), { mode: 0o600 });
  return kp;
}

export function account(accountId) {
  return new Account(accountId, provider, keyFor(accountId).toString());
}

export async function exists(accountId) {
  try { await provider.viewAccount({ accountId }); return true; } catch { return false; }
}

export async function view(contractId, method, args = {}) {
  return provider.callFunction({ contractId, method, args });
}

export async function createWithFaucet(accountId) {
  const res = await fetch(FAUCET, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: keyFor(accountId).getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`faucet ${res.status}: ${await res.text()}`);
  for (let i = 0; i < 20 && !(await exists(accountId)); i++) await new Promise((r) => setTimeout(r, 1500));
  if (!(await exists(accountId))) throw new Error(`${accountId} not visible after faucet call`);
}

export function plan(lines) {
  console.log((EXECUTE ? "EXECUTING (testnet):" : "PLAN (testnet, nothing signed):") + "\n- " + lines.join("\n- "));
}

export const txLink = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;
