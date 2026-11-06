// Shared helpers for the 1Click -> contract spike. Mainnet only (no Intents testnet).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Account, JsonRpcProvider, KeyPair, keyToImplicitAddress } from "near-api-js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, "..", "..", ".env") });

export const RPC_URL = process.env.SPIKE_MAINNET_RPC_URL || "https://free.rpc.fastnear.com";
export const ONECLICK = process.env.ONECLICK_API_BASE || "https://1click.chaindefuser.com";
export const ONECLICK_JWT = process.env.ONECLICK_JWT || ""; // optional; keyless when empty
// Verified 2026-11-06 from GET /v0/tokens (blockchain "near", symbol "USDC", 6 decimals).
export const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const USDC_ASSET = `nep141:${USDC}`;
export const KEY_FILE = path.join(here, "state", "spike-account.key.json");
export const WASM = path.join(here, "..", "recorder", "target", "near", "presafe_spike_recorder.wasm");

export const provider = new JsonRpcProvider({ url: RPC_URL });

export function loadKey() {
  if (!fs.existsSync(KEY_FILE)) throw new Error(`No key at ${KEY_FILE}. Run: node keygen.mjs`);
  const { accountId, secretKey } = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
  return { accountId, keyPair: KeyPair.fromString(secretKey) };
}

export function spikeAccount() {
  const { accountId, keyPair } = loadKey();
  return new Account(accountId, provider, keyPair.toString());
}

export function implicitFrom(keyPair) {
  return keyToImplicitAddress(keyPair.getPublicKey());
}

export async function view(contractId, method, args = {}) {
  return provider.callFunction({ contractId, method, args });
}

export async function oneclick(pathname, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (ONECLICK_JWT) headers.Authorization = `Bearer ${ONECLICK_JWT}`;
  const res = await fetch(`${ONECLICK}${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

export const flag = (name) => process.argv.includes(name);
export const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
