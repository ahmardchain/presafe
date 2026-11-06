// Sends USDC from the spike contract to a receiver. Usage: node withdraw.mjs <receiver> <amount> [--execute]
import { teraToGas } from "near-api-js";
import { USDC, flag, loadKey, spikeAccount } from "./common.mjs";
const { accountId } = loadKey();
const [receiver_id, amount] = process.argv.slice(2);
const call = { contractId: accountId, methodName: "withdraw", args: { token: USDC, receiver_id, amount }, gas: teraToGas(50) };
console.log("PLAN", JSON.stringify(call));
if (!flag("--execute")) { console.log("Plan only. Re-run with --execute to sign."); process.exit(0); }
const r = await spikeAccount().callFunctionRaw(call);
console.log("tx", r.transaction.hash, JSON.stringify(r.status));
