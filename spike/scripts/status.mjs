// Polls /v0/status for a deposit address until a final state. Usage: node status.mjs <depositAddress> [--once]
import { flag, oneclick } from "./common.mjs";
const addr = process.argv[2];
const FINAL = new Set(["SUCCESS", "REFUNDED", "FAILED", "INCOMPLETE_DEPOSIT"]);
for (;;) {
  const { status, json } = await oneclick(`/v0/status?depositAddress=${encodeURIComponent(addr)}`);
  console.log(new Date().toISOString(), status, json.status ?? "", JSON.stringify(json.swapDetails ?? json));
  if (flag("--once") || FINAL.has(json.status)) break;
  await new Promise((r) => setTimeout(r, 10_000));
}
