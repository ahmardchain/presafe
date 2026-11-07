// Browser-side contract reads (no Node Buffer).
import { JsonRpcProvider } from "near-api-js";
import { PRESAFE_CONTRACT, RPC_URL } from "@/lib/config";
import type { Obligation, Receipt } from "@/lib/near";

const provider = new JsonRpcProvider({ url: RPC_URL });
const view = <T,>(method: string, args: Record<string, unknown>) => provider.callFunction({ contractId: PRESAFE_CONTRACT, method, args }) as Promise<T>;

export const receiptsOf = (payer: string) => view<Receipt[]>("list_receipts_by_payer", { payer });
export const obligation = (id: string) => view<Obligation | null>("get_obligation", { obligation_id: id });
