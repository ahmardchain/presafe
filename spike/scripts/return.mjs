// Returns everything from the spike account to a beneficiary and deletes the account:
//   1. USDC.storage_deposit(beneficiary) if the beneficiary is not registered (0.00125 NEAR)
//   2. recorder.withdraw(USDC, beneficiary, full balance)
//   3. DeleteAccount(beneficiary): the remaining NEAR, including the contract's storage stake
// Prints the plan; signs only with --execute. Usage: node return.mjs <beneficiary.near> [--execute]
import { actions, nearToYocto, teraToGas, yoctoToNear } from "near-api-js";
import { USDC, flag, loadKey, provider, spikeAccount, view } from "./common.mjs";

const { accountId } = loadKey();
const beneficiary = process.argv[2];
if (!beneficiary) { console.error("need beneficiary"); process.exit(1); }
const usdc = await view(USDC, "ft_balance_of", { account_id: accountId });
const registered = await view(USDC, "storage_balance_of", { account_id: beneficiary });
const near = yoctoToNear((await provider.viewAccount({ accountId })).amount);
const plan = [
  ...(registered ? [] : [`tx A -> ${USDC}: storage_deposit {account_id:${beneficiary}, registration_only:true} deposit 0.00125 NEAR`]),
  ...(usdc !== "0" ? [`tx B -> ${accountId}: withdraw {token:${USDC}, receiver_id:${beneficiary}, amount:${usdc}} (${Number(usdc) / 1e6} USDC)`] : []),
  `tx C -> ${accountId}: DeleteAccount {beneficiary:${beneficiary}} (sends the remaining ~${near} NEAR minus fees)`,
];
console.log(`PLAN (mainnet, signer ${accountId}):\n- ` + plan.join("\n- "));
if (!flag("--execute")) { console.log("Plan only. Re-run with --execute to sign."); process.exit(0); }

const acct = spikeAccount();
if (!registered) {
  const r = await acct.callFunctionRaw({ contractId: USDC, methodName: "storage_deposit", args: { account_id: beneficiary, registration_only: true }, deposit: nearToYocto("0.00125"), gas: teraToGas(30) });
  console.log("txA", r.transaction.hash, JSON.stringify(r.status));
}
if (usdc !== "0") {
  const r = await acct.callFunctionRaw({ contractId: accountId, methodName: "withdraw", args: { token: USDC, receiver_id: beneficiary, amount: usdc }, gas: teraToGas(50) });
  console.log("txB", r.transaction.hash, JSON.stringify(r.status));
  await new Promise((res) => setTimeout(res, 3000));
  const left = await view(USDC, "ft_balance_of", { account_id: accountId });
  if (left !== "0") { console.error(`USDC still held (${left}); not deleting the account.`); process.exit(1); }
}
const r = await acct.signAndSendTransaction({ receiverId: accountId, actions: [actions.deleteAccount(beneficiary)] });
console.log("txC", r.transaction.hash, JSON.stringify(r.status));
