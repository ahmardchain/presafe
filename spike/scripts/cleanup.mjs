// Deletes the throwaway spike account and sends its remaining NEAR to a beneficiary.
// Run withdraw.mjs first: USDC held by the account is not moved by this.
// Usage: node cleanup.mjs <beneficiary.near> [--execute]
import { actions } from "near-api-js";
import { USDC, flag, loadKey, spikeAccount, view } from "./common.mjs";
const { accountId } = loadKey();
const beneficiary = process.argv[2];
if (!beneficiary) { console.error("need beneficiary"); process.exit(1); }
const usdc = await view(USDC, "ft_balance_of", { account_id: accountId });
console.log("PLAN", JSON.stringify({ signer: accountId, receiverId: accountId, actions: [`DeleteAccount(beneficiary=${beneficiary})`], usdcStillHeld: usdc }));
if (usdc !== "0") { console.error("Account still holds USDC. Withdraw it first."); process.exit(1); }
if (!flag("--execute")) { console.log("Plan only. Re-run with --execute to sign."); process.exit(0); }
const r = await spikeAccount().signAndSendTransaction({ receiverId: accountId, actions: [actions.deleteAccount(beneficiary)] });
console.log("tx", r.transaction.hash, JSON.stringify(r.status));
