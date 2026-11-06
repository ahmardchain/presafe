import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/format";

export interface TicketField {
  label: string;
  value: React.ReactNode;
}

/**
 * A die-cut ticket: main body with fields, a perforation, and a stub with a vertical
 * status word and a barcode. `stamp` prints a rotated ink stamp over the body.
 */
export function Ticket({
  eyebrow,
  title,
  fields,
  stubWord,
  stubNote,
  tone,
  stamp,
  className,
}: {
  eyebrow: string;
  title: string;
  fields: TicketField[];
  stubWord: string;
  stubNote?: string;
  tone: Tone;
  stamp?: string;
  className?: string;
}) {
  return (
    <div className={cn("ticket-shadow", `tone-${tone}`, className)}>
      <div className="ticket relative grid grid-cols-[1fr_auto] [--stub:60px] sm:[--stub:84px] [--cut:calc(100%-var(--stub))]">
        <div className="relative p-5 pr-4 sm:p-6 sm:pr-5">
          <div className="label">{eyebrow}</div>
          <div className="mt-1 font-heading text-[26px] leading-[1.05] sm:text-[34px]">{title}</div>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6">
            {fields.map((f) => (
              <div key={f.label}>
                <dt className="label">{f.label}</dt>
                <dd className="font-mono text-[13px] text-ink sm:text-[15px]">{f.value}</dd>
              </div>
            ))}
          </dl>
          {stamp && <div className="stamp absolute bottom-6 right-[-38px] z-10 bg-ticket/0 text-[12px]">{stamp}</div>}
        </div>
        <div className="relative flex w-[var(--stub)] items-center justify-center gap-1.5 py-5 sm:gap-2">
          <div className="perf absolute left-0 top-3 bottom-3" />
          <div className="vertical font-mono text-[13px] font-semibold tracking-[0.3em] text-[var(--tone)]">{stubWord}</div>
          <div className="barcode h-[78%] w-[14px] opacity-90 sm:w-[22px]" />
        </div>
      </div>
      {stubNote && <div className="label mt-3 pl-1">{stubNote}</div>}
    </div>
  );
}

export function Ticker({ value, decimals = 2 }: { value: number; decimals?: number }) {
  return <NumberTicker value={value} decimalPlaces={decimals} />;
}
