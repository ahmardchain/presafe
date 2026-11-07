"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Loader2 } from "lucide-react";
import { loadKey } from "@/lib/client/presafe-key";
import { ORIGINS, SPIKE } from "@/lib/oneclick";

interface Quote {
  origin: string;
  amountInFormatted: string;
  amountOutFormatted: string;
  timeEstimate: number;
  customRecipientMsg: string;
}

/**
 * Pay from another chain through NEAR Intents 1Click. NEAR Intents has no testnet, so on this
 * testnet deployment it shows a live dry-run quote (nothing can be sent) and links the verified
 * mainnet payment that took the same route.
 */
export function AnyChainPanel({ obligationId }: { obligationId: string }) {
  const [origin, setOrigin] = useState<string>(ORIGINS[0].id);
  const [units, setUnits] = useState(2);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, amount: String(units * 1_000_000), obligationId, payer: loadKey()?.accountId }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "quote failed");
        if (!cancelled) setQuote(j);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [origin, units, obligationId]);

  return (
    <div className="mt-10 rounded-md border border-rule bg-ticket p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-heading text-[28px] leading-none">Pay from another chain</h3>
        <span className="label">NEAR Intents · mainnet</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Customers holding USDC or USDT elsewhere pay through NEAR Intents 1Click. The stablecoin is swapped to USDC on NEAR
        and delivered straight into Presafe with the payment details attached, so it lands as a covered receipt in one step.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="rounded-md border border-rule bg-paper px-3 py-2 text-sm">
          {ORIGINS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <select value={units} onChange={(e) => setUnits(Number(e.target.value))} className="rounded-md border border-rule bg-paper px-3 py-2 font-mono text-sm">
          {[1, 2, 5].map((u) => <option key={u} value={u}>{u}.00</option>)}
        </select>
      </div>
      <div className="mt-4 min-h-[64px] border-y border-rule py-3 font-mono text-[14px]">
        {loading ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Live quote from 1Click…</span>
        ) : error ? (
          <span className="text-claims">{error}</span>
        ) : quote ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span>{quote.amountInFormatted} {quote.origin}</span>
              <ArrowRight className="size-4" />
              <span>{quote.amountOutFormatted} USDC on NEAR</span>
              <span className="text-muted-foreground">· about {quote.timeEstimate}s</span>
            </div>
            <div className="mt-1 break-all text-[12px] text-muted-foreground">delivered with msg {quote.customRecipientMsg}</div>
          </>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Preview only on this testnet demo: NEAR Intents runs on mainnet only, so this is a live dry-run quote and no
        deposit address is created. The same route delivered a real payment on mainnet: 1.00 USDC from Base, with the
        payment details intact (
        <a className="underline underline-offset-4" href={`https://nearblocks.io/txns/${SPIKE.nearTx}`}>
          NEAR tx <ArrowUpRight className="inline size-3" />
        </a>
        ,{" "}
        <a className="underline underline-offset-4" href={`https://basescan.org/tx/${SPIKE.baseTx}`}>
          Base tx <ArrowUpRight className="inline size-3" />
        </a>
        ).
      </p>
    </div>
  );
}
