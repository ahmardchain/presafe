import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Ticket, Ticker } from "@/components/Ticket";
import { explorerAccount, PRESAFE_CONTRACT, TOKEN_LABEL } from "@/lib/config";
import { amount, coveragePct, obligationTone, statusLabel, when } from "@/lib/format";
import { stubWord, summarize } from "@/lib/summary";

export const dynamic = "force-dynamic";

export default async function BadgePage({ params }: { params: Promise<{ business: string }> }) {
  const { business } = await params;
  const s = await summarize(business);
  if (!s) notFound();
  const b = s.business;
  const checkedAt = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="pt-10 md:pt-16">
        <a href={explorerAccount(b.account_id)} className="label inline-flex items-center gap-1 hover:text-ink">
          {b.account_id} <ArrowUpRight className="size-3" />
        </a>
        <h1 className="mt-2 font-heading text-[56px] leading-[0.95] sm:text-[80px]">{b.name}</h1>
      </section>

      {/* The one sentence a visitor reads first. */}
      <section className={`tone-${s.tone} mt-8 flex items-start gap-4 border-y border-rule py-6`}>
        <span className="mt-2.5 size-3 shrink-0 rounded-full bg-[var(--tone)] shadow-[0_0_0_6px_color-mix(in_oklab,var(--tone)_18%,transparent)]" />
        <p className="font-heading text-[30px] leading-tight sm:text-[38px]">{s.text}</p>
      </section>

      <section className="grid grid-cols-2 gap-px border-b border-rule bg-rule md:grid-cols-4">
        {[
          ["Bond", <><Ticker value={s.bond} /></>, TOKEN_LABEL],
          ["Prepayments covered", <><Ticker value={s.covered} /></>, TOKEN_LABEL],
          ["Claims paid", <><Ticker value={b.claims_paid_count} decimals={0} /></>, `${amount(b.claims_paid_amount)}`],
          ["Arbiter", <span key="a" className="break-all text-[15px]">{b.arbiter}</span>, "settles disputes"],
        ].map(([k, v, note], i) => (
          <div key={i} className="bg-paper py-5 pr-4 [&:not(:first-child)]:pl-5 max-md:[&:nth-child(3)]:pl-0">
            <div className="label">{k as string}</div>
            <div className="mt-1 font-mono text-[28px] leading-tight">{v}</div>
            <div className="mt-0.5 text-[13px] text-muted-foreground">{note as string}</div>
          </div>
        ))}
      </section>

      <section className="mt-14">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-[36px]">Obligations</h2>
          <span className="label">Read live · {checkedAt} UTC</span>
        </div>
        {s.obligations.length === 0 && <p className="mt-4 text-muted-foreground">No obligations yet.</p>}
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {s.obligations.map((o) => {
            const tone = obligationTone(o);
            const pct = coveragePct(o.coverage_bps);
            return (
              <div key={o.id}>
                <Ticket
                  tone={tone}
                  eyebrow={`Obligation #${o.id} · ${statusLabel[o.status]}`}
                  title={o.title}
                  stubWord={stubWord[tone]}
                  fields={[
                    { label: "Reserved", value: amount(o.reserve) },
                    { label: "Coverage", value: pct ?? "No sales yet" },
                    { label: "Deliver by", value: when(o.deliver_by_ns).replace(" UTC", "") },
                    o.status === "Defaulted"
                      ? { label: "Claimed", value: amount(o.claimed_total) }
                      : { label: "Claims open after", value: when(o.default_after_ns).replace(" UTC", "") },
                    { label: "Paid", value: `${o.receipt_count} · ${amount(o.covered_total, false)}` },
                  ]}
                />
                {o.status === "Open" && (
                  <Link href={`/pay/${o.id}`} className="mt-4 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-ink/90">
                    Pay with protection <ArrowUpRight className="size-4" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-16 grid gap-6 border-t border-rule pt-8 md:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-heading text-[30px] leading-tight">Put this badge on your ticket page</h2>
          <p className="mt-2 text-muted-foreground">It updates itself from the contract.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mt-4" src={`/b/${b.account_id}/badge.svg`} alt="Presafe badge preview" />
        </div>
        <pre className="overflow-x-auto rounded-md bg-ink p-4 font-mono text-[12px] leading-relaxed text-paper/90">{`<a href="https://<presafe-host>/b/${b.account_id}">
  <img src="https://<presafe-host>/b/${b.account_id}/badge.svg"
       alt="Protected by Presafe">
</a>`}</pre>
      </section>
      <p className="label mt-8">
        Every number on this page is read from{" "}
        <a className="underline underline-offset-4" href={explorerAccount(PRESAFE_CONTRACT)}>{PRESAFE_CONTRACT}</a>. No wallet needed.
      </p>
    </div>
  );
}
