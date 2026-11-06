import { TOKEN_DECIMALS, TOKEN_LABEL } from "./config";
import type { Business, Obligation } from "./near";

export function amount(raw: string | bigint, withLabel = true): string {
  const v = BigInt(raw);
  const unit = 10n ** BigInt(TOKEN_DECIMALS);
  const whole = v / unit;
  const cents = ((v % unit) * 100n) / unit;
  const s = `${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
  return withLabel ? `${s} ${TOKEN_LABEL}` : s;
}

export function coveragePct(bps: string | null): string | null {
  return bps === null ? null : `${Math.floor(Number(bps) / 100)}%`;
}

export const nsToDate = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n));

export function when(ns: string): string {
  return nsToDate(ns).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export type Tone = "protected" | "partial" | "claims" | "delivered" | "neutral";

export function obligationTone(o: Obligation): Tone {
  if (o.status === "Defaulted") return "claims";
  if (o.status === "Delivered") return "delivered";
  if (o.coverage_bps !== null && Number(o.coverage_bps) < 10_000) return "partial";
  return "protected";
}

export const statusLabel: Record<Obligation["status"], string> = {
  Open: "Open",
  MarkedDelivered: "Marked delivered, challenge window open",
  Disputed: "Disputed, waiting for the arbiter",
  Delivered: "Delivered",
  Defaulted: "Not delivered: claims open",
};

/** One sentence that summarises a business's protection, plus its tone. */
export function headline(b: Business, obs: Obligation[]): { tone: Tone; text: string } {
  const bond = amount(b.bond_total);
  if (obs.some((o) => o.status === "Defaulted")) {
    return { tone: "claims", text: `Claims open: a delivery was missed. ${b.claims_paid_count} claim${b.claims_paid_count === 1 ? "" : "s"} paid so far.` };
  }
  const live = obs.filter((o) => o.status !== "Delivered");
  const covered = live.reduce((s, o) => s + BigInt(o.covered_total), 0n);
  const reserved = live.reduce((s, o) => s + BigInt(o.reserve), 0n);
  if (covered === 0n) return { tone: "protected", text: `Protected: ${bond} bonded. No prepayments yet.` };
  const pct = Number((reserved * 100n) / covered);
  if (pct < 100) return { tone: "partial", text: `Partly protected: ${bond} bonded covers ${pct}% of prepayments.` };
  return { tone: "protected", text: `Protected: ${bond} bonded covers ${pct}% of prepayments.` };
}
