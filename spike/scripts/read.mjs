// Read-only: what the spike contract recorded, and its USDC balance.
import { USDC, loadKey, view } from "./common.mjs";
const { accountId } = loadKey();
console.log("records", JSON.stringify(await view(accountId, "get_records", {}), null, 2));
console.log("usdc_balance", await view(USDC, "ft_balance_of", { account_id: accountId }));
