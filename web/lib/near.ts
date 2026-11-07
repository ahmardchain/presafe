// Read-only access to the Presafe contract over NEAR JSON-RPC. No wallet, no SDK.
import { PRESAFE_CONTRACT, RPC_URL } from "./config";

export type Status = "Open" | "MarkedDelivered" | "Disputed" | "Delivered" | "Defaulted";

export interface Business {
  account_id: string;
  name: string;
  arbiter: string;
  bond_total: string;
  unlocked: string;
  locked: string;
  obligation_count: number;
  total_covered: string;
  claims_paid_count: number;
  claims_paid_amount: string;
}

export interface Obligation {
  id: string;
  business: string;
  arbiter: string;
  title: string;
  status: Status;
  deliver_by_ns: string;
  default_after_ns: string;
  challenge_ends_at_ns: string | null;
  reserve: string;
  covered_total: string;
  coverage_bps: string | null;
  disputed_total: string;
  claimed_total: string;
  receipt_count: number;
}

export interface Receipt {
  id: string;
  obligation_id: string;
  payer: string;
  amount: string;
  paid_at_ns: string;
  voided: boolean;
  disputed: boolean;
  claimed: boolean;
  payout: string;
  claimable: string;
}

export async function view<T>(method: string, args: object = {}, contract = PRESAFE_CONTRACT): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "presafe",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contract,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const json = await res.json();
  if (json.error || json.result?.error) throw new Error(`${method}: ${JSON.stringify(json.error ?? json.result.error)}`);
  return JSON.parse(Buffer.from(json.result.result).toString("utf8")) as T;
}

export const getBusiness = (id: string) => view<Business | null>("get_business", { account_id: id });
export const listObligations = (id: string) => view<Obligation[]>("list_obligations", { business: id });
export const listReceiptsByPayer = (payer: string) => view<Receipt[]>("list_receipts_by_payer", { payer });
