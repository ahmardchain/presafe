"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { createKey, loadKey, payWithTestUsdc, type PresafeKey } from "@/lib/client/presafe-key";
import { NETWORK, TOKEN_LABEL, explorerTx } from "@/lib/config";
import { amount as fmt } from "@/lib/format";

const UNIT = 1_000_000n;
const PRESETS = [1n, 2n, 5n];

type Step = "idle" | "account" | "paying" | "done" | "error";

export function PayPanel({
  obligationId,
  businessName,
  reserve,
  coveredTotal,
  open,
}: {
  obligationId: string;
  businessName: string;
  reserve: string;
  coveredTotal: string;
  open: boolean;
}) {
  const [units, setUnits] = useState<bigint>(2n);
  const [step, setStep] = useState<Step>("idle");
  const [hash, setHash] = useState<string>();
  const [error, setError] = useState<string>();
  const [key, setKey] = useState<PresafeKey | null>(null);
  const router = useRouter();
  useEffect(() => setKey(loadKey()), []);

  const amount = units * UNIT;
  // After this payment: your pro-rata share of the reserve, capped at what you paid.
  const covered = BigInt(coveredTotal) + amount;
  const share = (BigInt(reserve) * amount) / covered;
  const protectedAmt = share < amount ? share : amount;
  const fullyCovered = protectedAmt === amount;

  async function pay() {
    setError(undefined);
    try {
      const k = key ?? createKey();
      setKey(k);
      setStep("account");
      setStep("paying");
      const h = await payWithTestUsdc(k, obligationId, amount);
      setHash(h);
      setStep("done");
      router.refresh(); // re-read the obligation so the ticket shows the new coverage
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  if (step === "done" && hash) {
    return (
      <div className="tone-protected">
        <div className="flex size-11 items-center justify-center rounded-full bg-protected text-paper">
          <Check className="size-6" />
        </div>
        <h2 className="mt-4 font-heading text-[40px] leading-none">You&apos;re covered.</h2>
        <p className="mt-3 text-muted-foreground">
          {businessName} has your {fmt(amount)} already. If they don&apos;t deliver, you can claim up to{" "}
          <span className="font-mono text-ink">{fmt(protectedAmt)}</span> from their bond.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/claims" className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 font-medium text-paper">
            See your receipt
          </Link>
          <a href={explorerTx(hash)} className="inline-flex items-center gap-1.5 rounded-md border border-ink/70 px-5 py-3 font-medium">
            Transaction <ArrowUpRight className="size-4" />
          </a>
        </div>
        <p className="label mt-6">No gas paid · signed in this browser</p>
      </div>
    );
  }

  const busy = step === "account" || step === "paying";
  return (
    <div>
      <div className="label">Amount · {TOKEN_LABEL}</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.toString()}
            onClick={() => setUnits(p)}
            disabled={busy}
            className={`rounded-md border py-3 font-mono text-[20px] transition ${units === p ? "border-ink bg-ink text-paper" : "border-rule bg-ticket hover:border-ink/50"}`}
          >
            {p.toString()}.00
          </button>
        ))}
      </div>

      <div className={`mt-6 border-y border-rule py-5 ${fullyCovered ? "tone-protected" : "tone-partial"}`}>
        <div className="label">If {businessName} doesn&apos;t deliver</div>
        <p className="mt-1 font-heading text-[30px] leading-tight">
          You can claim up to <span className="text-[var(--tone)]">{fmt(protectedAmt, false)}</span>
          <span className="text-muted-foreground"> of {fmt(amount, false)}</span>
        </p>
        {!fullyCovered && (
          <p className="mt-2 text-sm text-muted-foreground">
            The bond reserved for this event is smaller than what customers have paid, so claims are shared pro rata.
          </p>
        )}
      </div>

      <button
        onClick={pay}
        disabled={!open || busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-ink py-4 text-[17px] font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
      >
        {busy && <Loader2 className="size-5 animate-spin" />}
        {!open ? "This obligation no longer takes payments" : step === "account" ? "Setting up your Presafe key…" : step === "paying" ? "Paying…" : `Pay ${fmt(amount)}`}
      </button>
      {error && <p className="mt-3 text-sm text-claims">{error}</p>}

      <ul className="mt-6 space-y-1.5 text-sm text-muted-foreground">
        {NETWORK === "testnet" && <li>Test mode: this mints free test USDC to you and pays it in one step.</li>}
        <li>No wallet and no gas: you sign in this browser and Presafe&apos;s relayer pays the fees.</li>
        <li>The business receives the money immediately. Only its bond stands behind your claim.</li>
        <li>Paying from another chain (NEAR Intents) works on mainnet only; it is coming next.</li>
      </ul>
    </div>
  );
}
