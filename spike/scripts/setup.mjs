// Deploys the recorder to the spike account, initializes it, and registers it with USDC storage.
// Prints the plan. Signs only with --execute.
import fs from "node:fs";
import { actions, nearToYocto, teraToGas, yoctoToNear } from "near-api-js";
import { USDC, WASM, flag, loadKey, provider, spikeAccount, view } from "./common.mjs";

const { accountId } = loadKey();
const wasm = fs.readFileSync(WASM);
const bounds = await view(USDC, "storage_balance_bounds");
const reg = await view(USDC, "storage_balance_of", { account_id: accountId });
let state = null; try { state = await provider.viewAccount({ accountId }); } catch (e) { state = null; }

console.log(JSON.stringify({
  network: "mainnet", signer: accountId,
  accountExists: !!state, balanceNear: state ? yoctoToNear(state.amount) : "0",
  tx1: { receiverId: accountId, actions: [`DeployContract(${wasm.length} bytes)`, `FunctionCall new {owner:${accountId}, token:${USDC}} gas=30Tgas deposit=0`] },
  tx2: reg ? "skip: already registered with USDC" : { receiverId: USDC, actions: [`FunctionCall storage_deposit {account_id:${accountId}, registration_only:true} gas=30Tgas deposit=${bounds.min} yocto (${yoctoToNear(bounds.min)} NEAR)`] },
}, null, 2));

if (!flag("--execute")) { console.log("\nPlan only. Re-run with --execute to sign."); process.exit(0); }
const acct = spikeAccount();
const r1 = await acct.signAndSendTransaction({
  receiverId: accountId,
  actions: [actions.deployContract(wasm), actions.functionCall("new", { owner: accountId, token: USDC }, teraToGas(30), 0n)],
});
console.log("tx1", r1.transaction.hash, JSON.stringify(r1.status));
if (!reg) {
  const r2 = await acct.callFunctionRaw({ contractId: USDC, methodName: "storage_deposit", args: { account_id: accountId, registration_only: true }, deposit: BigInt(bounds.min), gas: teraToGas(30) });
  console.log("tx2", r2.transaction.hash, JSON.stringify(r2.status));
}
