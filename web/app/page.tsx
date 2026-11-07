import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Ticket, Ticker } from "@/components/Ticket";
import { MoneyFlow } from "@/components/MoneyFlow";
import { DEMO_BUSINESS, TOKEN_LABEL } from "@/lib/config";
import { day } from "@/lib/format";
import { stubWord, summarize } from "@/lib/summary";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await summarize(DEMO_BUSINESS).catch(() => null);

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-start gap-12 px-4 pt-10 sm:px-6 md:grid-cols-[1.05fr_1fr] md:pt-20">
        <div>
          <div className="label">Prepayment protection · NEAR</div>
          <h1 className="mt-4 font-heading text-[56px] leading-[0.95] tracking-[-0.01em] sm:text-[84px]">
            Paid upfront.
            <br />
            <em className="text-protected">Protected</em> anyway.
          </h1>
          <p className="mt-6 max-w-[34em] text-[18px] leading-relaxed text-muted-foreground">
            A business posts a USDC bond and gets a public badge. If it doesn&apos;t deliver by the date it promised, the
            customers who paid claim the bond back. No gas, from any chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/b/${DEMO_BUSINESS}`}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 font-medium text-paper hover:bg-ink/90"
            >
              See a live bond <ArrowRight className="size-4" />
            </Link>
            <Link href="/business" className="inline-flex items-center rounded-md border border-ink/80 px-5 py-3 font-medium hover:bg-ink/5">
              Post a bond
            </Link>
          </div>
        </div>

        {/* The product as the hero: a live ticket printing out of a slot. */}
        <div className="relative">
          <div className="relative z-20 h-3 rounded-full bg-ink shadow-[inset_0_-2px_0_rgba(255,255,255,.08)]" />
          <div className="relative -mt-1.5 px-3 pb-10 [clip-path:inset(0_-60px_-80px_-60px)]">
            <div className="printing">
              {s ? (
                <Link href={`/b/${DEMO_BUSINESS}`} className="block">
                  <Ticket
                    tone={s.tone}
                    eyebrow={s.business.account_id}
                    title={s.next?.title ?? s.business.name}
                    stubWord={stubWord[s.tone]}
                    stamp={s.tone === "protected" ? "Bonded" : undefined}
                    fields={[
                      { label: `Bond · ${TOKEN_LABEL}`, value: <Ticker value={s.bond} /> },
                      { label: "Coverage", value: s.coveragePct === null ? "No sales yet" : <><Ticker value={s.coveragePct} decimals={0} />%</> },
                      { label: "Deliver by", value: s.next ? day(s.next.deliver_by_ns) : "—" },
                      { label: "Claims paid", value: s.business.claims_paid_count },
                    ]}
                  />
                </Link>
              ) : (
                <div className="label p-6">Testnet RPC unreachable right now.</div>
              )}
            </div>
          </div>
          <div className="label -mt-4 px-4">Live from the contract · demo business is fictional</div>
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-6xl border-y border-rule px-4 py-10 sm:px-6">
        <div className="grid items-end gap-6 md:grid-cols-[auto_1fr]">
          <div className="font-heading text-[88px] leading-none sm:text-[120px]">
            11<span className="text-muted-foreground">/521</span>
          </div>
          <div className="pb-3">
            <p className="max-w-[36em] text-[19px] leading-snug">
              ticket buyers got their money back when New York&apos;s Evolutions Festival was cancelled, and only by
              disputing card charges. No escrow or financial protection was held.
            </p>
            <a
              className="label mt-3 inline-block underline underline-offset-4"
              href="https://www.fingerlakes1.com/2026/09/30/new-york-sues-canceled-festival-promoters-over-refunds/"
            >
              FingerLakes1 · as of Sep 30, 2026
            </a>
          </div>
        </div>
      </section>

      <section className="mt-24 bg-ink text-paper">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Where the money goes</div>
            <h2 className="mt-4 font-heading text-[44px] leading-[1.02] sm:text-[56px]">A bond, not escrow.</h2>
            <p className="mt-5 max-w-[30em] text-[17px] leading-relaxed text-white/70">
              Escrow locks the presale cash organizers need for venues and artists, so they avoid it. With Presafe the
              business keeps every payment the moment it arrives. Only the bond waits, and it only moves if the business
              doesn&apos;t deliver.
            </p>
          </div>
          <MoneyFlow />
        </div>
      </section>

      <section className="mx-auto mt-24 grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-3">
        {[
          ["01", "Bond", "The business locks USDC and reserves part of it for each event or order. Its badge shows the number."],
          ["02", "Pay", "Customers see the coverage before paying, from NEAR or any chain through NEAR Intents."],
          ["03", "Deliver or claim", "Missed the date? Anyone triggers default and each customer claims their share. Presafe pays the gas."],
        ].map(([n, t, d]) => (
          <div key={n} className="border-t border-ink pt-4">
            <div className="label">{n}</div>
            <div className="mt-2 font-heading text-[32px] leading-none">{t}</div>
            <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
    </>
  );
}
