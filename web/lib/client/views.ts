// Browser-side contract reads (no Node Buffer). Optimistic finality so the UI sees the result
// of a transaction it just sent, instead of waiting a few blocks for finality.
import { JsonRpcProvider } from "near-api-js";
import { PRESAFE_CONTRACT, RPC_URL } from "@/lib/config";
import type { Obligation, Receipt } from "@/lib/near";

const provider = new JsonRpcProvider({ url: RPC_URL });
const OPT = { finality: "optimistic" } as const;
const view = <T,>(method: string, args: Record<string, unknown>) => provider.callFunction({ contractId: PRESAFE_CONTRACT, method, args, blockQuery: OPT }) as Promise<T>;

export const receiptsOf = (payer: string) => view<Receipt[]>("list_receipts_by_payer", { payer });
export const obligation = (id: string) => view<Obligation | null>("get_obligation", { obligation_id: id });

import type { Business } from "@/lib/near";
import { USDC_CONTRACT } from "@/lib/config";

export const business = (id: string) => view<Business | null>("get_business", { account_id: id });
export const obligationsOf = (id: string) => view<Obligation[]>("list_obligations", { business: id });
export const storageOf = (id: string) =>
  view<{ total: string; available: string } | null>("storage_balance_of", { account_id: id });
export const usdcBalance = (id: string) =>
  provider.callFunction({ contractId: USDC_CONTRACT, method: "ft_balance_of", args: { account_id: id }, blockQuery: OPT }) as Promise<string>;
export const usdcRegistered = (id: string) =>
  provider.callFunction({ contractId: USDC_CONTRACT, method: "storage_balance_of", args: { account_id: id }, blockQuery: OPT }).then((r) => !!r);
export const nearBalance = (id: string) => provider.viewAccount({ accountId: id, blockQuery: OPT }).then((a) => a.amount.toString());
