import { TOKEN_DECIMALS } from "./config";
import { headline, type Tone } from "./format";
import { getBusiness, listObligations, type Business, type Obligation } from "./near";

export interface Summary {
  business: Business;
  obligations: Obligation[];
  tone: Tone;
  text: string;
  bond: number;
  covered: number;
  claimsPaid: number;
  coveragePct: number | null;
  next: Obligation | undefined;
}

const toNum = (raw: string | bigint) => Number(BigInt(raw)) / 10 ** TOKEN_DECIMALS;

export async function summarize(id: string): Promise<Summary | null> {
  const business = await getBusiness(id);
  if (!business) return null;
  const obligations = await listObligations(id);
  const h = headline(business, obligations);
  const live = obligations.filter((o) => o.status !== "Delivered");
  const covered = live.reduce((s, o) => s + BigInt(o.covered_total), 0n);
  const reserved = live.reduce((s, o) => s + BigInt(o.reserve), 0n);
  return {
    business,
    obligations,
    tone: h.tone,
    text: h.text,
    bond: toNum(business.bond_total),
    covered: toNum(business.total_covered),
    claimsPaid: toNum(business.claims_paid_amount),
    coveragePct: covered === 0n ? null : Number((reserved * 100n) / covered),
    next: obligations.find((o) => o.status === "Open") ?? obligations[0],
  };
}

export const stubWord: Record<Tone, string> = {
  protected: "PROTECTED",
  partial: "PARTIAL",
  claims: "CLAIMS OPEN",
  delivered: "DELIVERED",
  neutral: "PRESAFE",
};
