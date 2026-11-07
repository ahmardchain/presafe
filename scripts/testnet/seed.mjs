// Seeds the demo business "Lagos Sound Fest": registers it, mints and funds a 5 mUSDC bond,
// and creates an obligation due in --minutes (default 10) with a short grace and challenge window.
// Prints the plan; signs only with --execute.
import { nearToYocto, teraToGas } from "near-api-js";
import { ACCOUNTS, EXECUTE, account, plan, txLink, view } from "./common.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const minutes = Number(arg("--minutes", "10"));
const graceMin = Number(arg("--grace-minutes", "2"));
const title = arg("--title", "Lagos Sound Fest: demo night");
const BOND = 5_000_000n; // 5 mUSDC
const biz = ACCOUNTS.business;

const registered = await view(ACCOUNTS.presafe, "get_business", { account_id: biz });
const deliverBy = BigInt(Date.now() + minutes * 60_000) * 1_000_000n;
plan([
  registered ? `skip: ${biz} already registered` : `${biz}: register_business("Lagos Sound Fest") with 0.1 NEAR storage deposit`,
  `${biz}: mint ${BOND} (5 mUSDC) on ${ACCOUNTS.usdc}`,
  `${biz}: ft_transfer_call 5 mUSDC to ${ACCOUNTS.presafe} msg {"action":"fund_bond"}`,
  `${biz}: create_obligation("${title}", deliver_by=now+${minutes}min, reserve=5 mUSDC, grace=${graceMin}min, challenge window=2min)`,
]);
if (!EXECUTE) process.exit(0);

const b = account(biz);
const call = async (contractId, methodName, args, deposit = 0n, gas = teraToGas(100)) => {
  const r = await b.callFunctionRaw({ contractId, methodName, args, deposit, gas });
  console.log(methodName, txLink(r.transaction.hash));
  return r;
};
if (!registered) await call(ACCOUNTS.presafe, "register_business", { name: "Lagos Sound Fest" }, nearToYocto("0.1"));
await call(ACCOUNTS.usdc, "mint", { account_id: biz, amount: BOND.toString() }, nearToYocto("0.00125"));
await call(ACCOUNTS.usdc, "ft_transfer_call", { receiver_id: ACCOUNTS.presafe, amount: BOND.toString(), msg: JSON.stringify({ action: "fund_bond" }) }, 1n, teraToGas(150));
await call(ACCOUNTS.presafe, "create_obligation", {
  title, deliver_by_ns: deliverBy.toString(), reserve: BOND.toString(),
  grace_ns: (BigInt(graceMin * 60) * 1_000_000_000n).toString(), challenge_window_ns: (120n * 1_000_000_000n).toString(),
});
console.log("business", JSON.stringify(await view(ACCOUNTS.presafe, "get_business", { account_id: biz })));
console.log("obligations", JSON.stringify(await view(ACCOUNTS.presafe, "list_obligations", { business: biz })));
