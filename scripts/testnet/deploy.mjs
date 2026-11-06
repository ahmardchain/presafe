// Creates the testnet accounts with the faucet, deploys mock USDC and Presafe, and registers
// Presafe with the token. Idempotent. Prints the plan; signs only with --execute.
// Prerequisite: contract/run-tests.sh (or the two cargo near builds) has produced the wasm files.
import fs from "node:fs";
import { actions, nearToYocto, teraToGas } from "near-api-js";
import { ACCOUNTS, EXECUTE, WASM, account, createWithFaucet, exists, plan, txLink, view } from "./common.mjs";

const missing = [];
for (const id of Object.values(ACCOUNTS)) if (!(await exists(id))) missing.push(id);
const usdcDeployed = (await exists(ACCOUNTS.usdc)) && (await view(ACCOUNTS.usdc, "ft_metadata").catch(() => null));
const presafeDeployed = (await exists(ACCOUNTS.presafe)) && (await view(ACCOUNTS.presafe, "get_config").catch(() => null));

const presafeInit = { owner: ACCOUNTS.arbiter, usdc: ACCOUNTS.usdc, default_arbiter: ACCOUNTS.arbiter };
plan([
  ...missing.map((id) => `create ${id} via testnet faucet (key generated locally)`),
  usdcDeployed ? `skip: ${ACCOUNTS.usdc} already has mock USDC` : `deploy mock_ft.wasm (${fs.statSync(WASM.usdc).size} bytes) to ${ACCOUNTS.usdc} and call new()`,
  presafeDeployed ? `skip: ${ACCOUNTS.presafe} already deployed` : `deploy presafe.wasm (${fs.statSync(WASM.presafe).size} bytes) to ${ACCOUNTS.presafe} and call new(${JSON.stringify(presafeInit)})`,
  `register ${ACCOUNTS.presafe} with ${ACCOUNTS.usdc} storage (storage_deposit, 0.00125 NEAR) if not registered`,
]);
if (!EXECUTE) process.exit(0);

for (const id of missing) { await createWithFaucet(id); console.log("created", id); }

if (!usdcDeployed) {
  const r = await account(ACCOUNTS.usdc).signAndSendTransaction({
    receiverId: ACCOUNTS.usdc,
    actions: [actions.deployContract(fs.readFileSync(WASM.usdc)), actions.functionCall("new", {}, teraToGas(30), 0n)],
  });
  console.log("mock USDC deployed", txLink(r.transaction.hash));
}
if (!presafeDeployed) {
  const r = await account(ACCOUNTS.presafe).signAndSendTransaction({
    receiverId: ACCOUNTS.presafe,
    actions: [actions.deployContract(fs.readFileSync(WASM.presafe)), actions.functionCall("new", presafeInit, teraToGas(30), 0n)],
  });
  console.log("Presafe deployed", txLink(r.transaction.hash));
}
const reg = await view(ACCOUNTS.usdc, "storage_balance_of", { account_id: ACCOUNTS.presafe });
if (!reg) {
  const r = await account(ACCOUNTS.presafe).callFunctionRaw({
    contractId: ACCOUNTS.usdc, methodName: "storage_deposit",
    args: { account_id: ACCOUNTS.presafe, registration_only: true }, deposit: nearToYocto("0.00125"), gas: teraToGas(30),
  });
  console.log("Presafe registered with mock USDC", txLink(r.transaction.hash));
}
console.log("config", JSON.stringify(await view(ACCOUNTS.presafe, "get_config")));
