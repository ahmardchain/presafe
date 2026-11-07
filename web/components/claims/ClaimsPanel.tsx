"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { StubMark } from "@/components/Stub";
import { claim, dispute, exportKey, importKey, loadKey, triggerDefault, type PresafeKey } from "@/lib/client/presafe-key";
import { obligation as getObligation, receiptsOf } from "@/lib/client/views";
import { DEMO_BUSINESS, explorerTx } from "@/lib/config";
import { amount as fmt, day, when } from "@/lib/format";
import type { Obligation, Receipt } from "@/lib/near";

type Row = { r: Receipt; o: Obligation | null };
type Busy = { id: string; what: string } | null;

const nowNs = () => BigInt(Date.now()) * 1_000_000n;

export function ClaimsPanel() {
  const [key, setKey] = useState<PresafeKey | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  const refresh = useCallback(async (k: PresafeKey) => {
    const receipts = await receiptsOf(k.accountId).catch(() => []);
    const ids = [...new Set(receipts.map((r) => r.obligation_id))];
    const obs = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await getObligation(id).catch(() => null)] as const)));
    setRows(receipts.filter((r) => !r.voided).reverse().map((r) => ({ r, o: obs[r.obligation_id] ?? null })));
  }, []);

  useEffect(() => {
    const k = loadKey();
    setKey(k);
    if (k) refresh(k);
  }, [refresh]);

  async function act(row: Row, what: "claim" | "dispute" | "default") {
    if (!key) return;
    setError(undefined);
    setBusy({ id: row.r.id, what });
    try {
      const hash =
        what === "claim" ? await claim(key, row.r.id) : what === "dispute" ? await dispute(key, row.r.id) : await triggerDefault(key, row.r.obligation_id);
      setDone((d) => ({ ...d, [`${row.r.id}:${what}`]: hash }));
      await refresh(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (key === undefined) return <p className="label mt-10">Loading…</p>;

  if (!key || (rows && rows.length === 0)) {
    return (
      <div className="mt-10 border-y border-rule py-12 text-center">
        <div className="mx-auto w-fit text-muted-foreground"><StubMark size={56} /></div>
        <h2 className="mt-4 font-heading text-[34px]">No receipts in this browser yet</h2>
        <p className="mx-auto mt-2 max-w-[28em] text-muted-foreground">
          When you pay with Presafe, your receipt lives here, and so does your claim if the business doesn&apos;t deliver.
        </p>
        <Link href={`/b/${DEMO_BUSINESS}`} className="mt-6 inline-flex rounded-md bg-ink px-5 py-3 font-medium text-paper">
          See a live bond
        </Link>
        <div className="mx-auto max-w-xl"><KeyTools k={key ?? null} onImport={(k) => { setKey(k); refresh(k); }} /></div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between border-b border-rule pb-3">
        <span className="label">Your account · {key.accountId.slice(0, 8)}…{key.accountId.slice(-6)}</span>
        <button onClick={() => refresh(key)} className="label inline-flex items-center gap-1.5 hover:text-ink">
          <RefreshCw className="size-3" /> Refresh
        </button>
      </div>
      {rows === null && <p className="label mt-6">Reading receipts…</p>}
      <div className="divide-y divide-rule">
        {rows?.map((row) => (
          <ReceiptRow key={row.r.id} row={row} busy={busy} done={done} onAct={act} />
        ))}
      </div>
      {error && <p className="mt-4 text-sm text-claims">{error}</p>}
      <KeyTools k={key} onImport={(k) => { setKey(k); refresh(k); }} />
    </div>
  );
}

function ReceiptRow({ row, busy, done, onAct }: { row: Row; busy: Busy; done: Record<string, string>; onAct: (row: Row, what: "claim" | "dispute" | "default") => void }) {
  const { r, o } = row;
  const isBusy = (w: string) => busy?.id === r.id && busy.what === w;
  const claimHash = done[`${r.id}:claim`];
  const now = nowNs();
  const canDefault = o?.status === "Open" && now >= BigInt(o.default_after_ns);
  const canDispute = o?.status === "MarkedDelivered" && !r.disputed && o.challenge_ends_at_ns !== null && now < BigInt(o.challenge_ends_at_ns);
  const claimable = BigInt(r.claimable);

  return (
    <div className={`grid gap-4 py-6 sm:grid-cols-[1fr_auto] sm:items-center ${r.claimed ? "tone-protected" : o?.status === "Defaulted" ? "tone-claims" : "tone-protected"}`}>
      <div>
        <div className="label">Receipt #{r.id} · paid {day(r.paid_at_ns)}</div>
        <div className="mt-1 font-heading text-[28px] leading-tight">{o?.title ?? `Obligation #${r.obligation_id}`}</div>
        <div className="mt-1 font-mono text-[14px] text-muted-foreground">
          Paid {fmt(r.amount)}
          {o && o.status === "Open" && <> · claims open after {when(o.default_after_ns)} if not delivered</>}
          {o && o.status === "MarkedDelivered" && <> · business says delivered{r.disputed ? " · you disputed" : ""}</>}
          {o && o.status === "Disputed" && <> · disputed, waiting for the arbiter</>}
          {o && o.status === "Delivered" && <> · delivered</>}
        </div>
      </div>
      <div className="sm:text-right">
        {r.claimed ? (
          <div className="tear-in">
            <div className="inline-flex items-center gap-2 font-heading text-[28px] text-protected">
              <Check className="size-6" /> Paid back {fmt(r.payout)}
            </div>
            <div className="label mt-1">Presafe paid the gas{claimHash && <> · <a className="underline" href={explorerTx(claimHash)}>tx</a></>}</div>
          </div>
        ) : claimable > 0n ? (
          <button
            onClick={() => onAct(row, "claim")}
            disabled={!!busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-claims px-6 py-4 text-[18px] font-medium text-white hover:brightness-95 disabled:opacity-60 sm:w-auto"
          >
            {isBusy("claim") && <Loader2 className="size-5 animate-spin" />} Claim {fmt(claimable)}
          </button>
        ) : canDefault ? (
          <button onClick={() => onAct(row, "default")} disabled={!!busy} className="inline-flex items-center gap-2 rounded-md border border-claims px-5 py-3 font-medium text-claims disabled:opacity-60">
            {isBusy("default") && <Loader2 className="size-4 animate-spin" />} Deadline missed: open claims
          </button>
        ) : canDispute ? (
          <button onClick={() => onAct(row, "dispute")} disabled={!!busy} className="inline-flex items-center gap-2 rounded-md border border-ink px-5 py-3 font-medium disabled:opacity-60">
            {isBusy("dispute") && <Loader2 className="size-4 animate-spin" />} It wasn&apos;t delivered
          </button>
        ) : (
          <span className="label">
            {o?.status === "Delivered" ? "Delivered" : o?.status === "Open" ? `Protected until ${day(o.default_after_ns)}` : r.disputed ? "Dispute filed" : "Waiting"}
          </span>
        )}
      </div>
    </div>
  );
}

function KeyTools({ k, onImport }: { k: PresafeKey | null; onImport: (k: PresafeKey) => void }) {
  const [copied, setCopied] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string>();
  return (
    <details className="mt-10 max-w-xl text-left">
      <summary className="label cursor-pointer hover:text-ink">Your Presafe key: back up or restore</summary>
      <p className="mt-3 text-sm text-muted-foreground">
        Your receipts belong to a key stored only in this browser. Clearing browser data deletes it. Copy it somewhere
        safe, or paste a saved key to restore your receipts on this device.
      </p>
      {k && (
        <button
          onClick={() => { navigator.clipboard.writeText(exportKey(k)).then(() => setCopied(true)).catch(() => {}); }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 text-sm"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy recovery key"}
        </button>
      )}
      <div className="mt-3 flex gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="ed25519:…" className="min-w-0 flex-1 rounded-md border border-rule bg-ticket px-3 py-2 font-mono text-sm" />
        <button
          onClick={() => { try { onImport(importKey(value)); setErr(undefined); } catch { setErr("That is not a valid key."); } }}
          className="rounded-md bg-ink px-3 py-2 text-sm text-paper"
        >
          Restore
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-claims">{err}</p>}
    </details>
  );
}

