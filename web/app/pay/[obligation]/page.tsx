import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Ticket } from "@/components/Ticket";
import { PayPanel } from "@/components/pay/PayPanel";
import { amount, coveragePct, day, obligationTone, statusLabel } from "@/lib/format";
import { getBusiness, view, type Obligation } from "@/lib/near";
import { stubWord } from "@/lib/summary";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ obligation: string }> }) {
  const { obligation: id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const o = await view<Obligation | null>("get_obligation", { obligation_id: id });
  if (!o) notFound();
  const b = await getBusiness(o.business);
  if (!b) notFound();
  const tone = obligationTone(o);
  const open = o.status === "Open" && Date.now() * 1e6 < Number(o.deliver_by_ns);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 md:pt-14">
      <Link href={`/b/${b.account_id}`} className="label inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="size-3" /> {b.name}&apos;s bond
      </Link>
      <div className="mt-6 grid gap-12 md:grid-cols-[1fr_0.9fr]">
        <div>
          <h1 className="font-heading text-[48px] leading-[0.98] sm:text-[64px]">Pay with protection</h1>
          <p className="mt-4 max-w-[32em] text-[17px] text-muted-foreground">
            Your money goes straight to {b.name}. If they don&apos;t deliver by the deadline, you claim it back from
            their bond.
          </p>
          <Ticket
            className="mt-8"
            tone={tone}
            eyebrow={`${b.account_id} · ${statusLabel[o.status]}`}
            title={o.title}
            stubWord={stubWord[tone]}
            fields={[
              { label: "Bond reserved", value: amount(o.reserve) },
              { label: "Coverage now", value: coveragePct(o.coverage_bps) ?? "No sales yet" },
              { label: "Deliver by", value: day(o.deliver_by_ns) },
              { label: "Paid so far", value: `${o.receipt_count} · ${amount(o.covered_total, false)}` },
            ]}
          />
        </div>
        <div className="md:pt-3">
          <PayPanel obligationId={o.id} businessName={b.name} reserve={o.reserve} coveredTotal={o.covered_total} open={open} />
        </div>
      </div>
    </div>
  );
}
