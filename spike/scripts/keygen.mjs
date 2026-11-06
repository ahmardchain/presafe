// Generates a fresh ed25519 key for a throwaway mainnet implicit account.
// Writes the secret to state/ (git-ignored). Prints only the account id and public key.
import fs from "node:fs";
import { KeyPair } from "near-api-js";
import { KEY_FILE, implicitFrom } from "./common.mjs";

if (fs.existsSync(KEY_FILE)) {
  const { accountId, publicKey } = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
  console.log(`Key already exists. accountId=${accountId} publicKey=${publicKey}`);
  process.exit(0);
}
const kp = KeyPair.fromRandom("ed25519");
const accountId = implicitFrom(kp);
fs.writeFileSync(KEY_FILE, JSON.stringify({ accountId, publicKey: kp.getPublicKey().toString(), secretKey: kp.toString() }, null, 2), { mode: 0o600 });
console.log(`accountId=${accountId}\npublicKey=${kp.getPublicKey().toString()}`);
