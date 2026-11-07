// Requests a 1Click quote that delivers NEAR USDC to the spike contract via ft_transfer_call.
// Default is dry: true (no deposit address, nothing to spend). --live requests a real quote.
// Usage: node quote.mjs --origin <assetId> --amount <smallest units> --refund <origin-chain address> [--live]
import fs from "node:fs";
import path from "node:path";
import { USDC_ASSET, arg, flag, loadKey, oneclick } from "./common.mjs";

const { accountId } = loadKey();
const origin = arg("--origin"), amount = arg("--amount"), refundTo = arg("--refund");
if (!origin || !amount || !refundTo) { console.error("need --origin --amount --refund"); process.exit(1); }
const live = flag("--live");
const msg = JSON.stringify({ action: "pay", obligation_id: "spike-1", payer: refundTo });
const body = {
  dry: !live,
  swapType: "EXACT_INPUT",
  slippageTolerance: 100,
  originAsset: origin,
  depositType: "ORIGIN_CHAIN",
  destinationAsset: USDC_ASSET,
  amount,
  refundTo,
  refundType: "ORIGIN_CHAIN",
  recipient: accountId,
  recipientType: "DESTINATION_CHAIN",
  customRecipientMsg: msg,
  deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
};
console.log("REQUEST", JSON.stringify(body, null, 2));
const { status, json } = await oneclick("/v0/quote", { method: "POST", body });
console.log("RESPONSE", status, JSON.stringify(json, null, 2));
if (live && status < 300) fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "state", `quote-${Date.now()}.json`), JSON.stringify({ body, json }, null, 2));
