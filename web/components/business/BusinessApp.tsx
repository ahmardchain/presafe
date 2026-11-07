"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Loader2, LogOut, Wallet, FlaskConical } from "lucide-react";
import {
  TGAS,
  connectWallet,
  restoreDemo,
  restoreWallet,
  startDemo,
  type BizSigner,
} from "@/lib/client/business-signer";
import { business as getBusiness, nearBalance, obligationsOf, storageOf, usdcBalance, usdcRegistered } from "@/lib/client/views";
import { NETWORK, PRESAFE_CONTRACT, TOKEN_LABEL, USDC_CONTRACT, explorerAccount, explorerTx } from "@/lib/config";
import { amount as fmt, coveragePct, day, statusText, when } from "@/lib/format";
import type { Business, Obligation } from "@/lib/near";

const UNIT = 1_000_000n;
const STORAGE_DEPOSIT = 50_000_000_000_000_000_000_000n; // 0.05 NEAR
const MINT_DEPOSIT = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR
const MIN = 60n * 1_000_000_000n;
const HOUR = 60n * MIN;
const DAY = 24n * HOUR;

interface State {
  biz: Business | null;
  obligations: Obligation[];
  usdc: bigint;
  near: bigint;
  storageAvailable: bigint;
}

const toUnits = (s: string) => {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 1_000_000));
};
const near = (y: bigint) => (Number(y / 10n ** 20n) / 10_000).toFixed(4);

export function BusinessApp() {
  const [signer, setSigner] = useState<BizSigner | null | undefined>(undefined);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [last, setLast] = useState<{ what: string; hash: string }>();

  const load = useCallback(async (s: BizSigner) => {
    const [biz, obligations, usdc, nearBal, storage] = await Promise.all([
      getBusiness(s.accountId).catch(() => null),
      obligationsOf(s.accountId).catch(() => []),
      usdcBalance(s.accountId).catch(() => "0"),
      nearBalance(s.accountId).catch(() => "0"),
      storageOf(s.accountId).catch(() => null),
    ]);
    setState({ biz, obligations, usdc: BigInt(usdc), near: BigInt(nearBal), storageAvailable: BigInt(storage?.available ?? "0") });
  }, []);

  useEffect(() => {
    (async () => {
      const s = restoreDemo() ?? (await restoreWallet());
      setSigner(s);
      if (s) load(s);
    })();
  }, [load]);

  /** Runs one contract call, shows its transaction, and re-reads state. */
  async function run(what: string, contractId: string, method: string, args: object, deposit = 0n, gas = 30n * TGAS) {
    if (!signer) return;
    setBusy(what);
    setError(undefined);
    try {
      const hash = await signer.call(contractId, method, args, deposit, gas);
      await load(signer);
      setLast({ what, hash });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function signIn(kind: "wallet" | "demo") {
    setBusy(kind);
    setError(undefined);
    try {
      const s = kind === "wallet" ? await connectWallet() : await startDemo();
      setSigner(s);
      await load(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    await signer?.disconnect();
    setSigner(null);
    setState(null);
  }

  if (signer === undefined) return <p className="label mt-10">Loading…</p>;

  if (!signer) {
    return (
      <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-rule bg-rule md:grid-cols-2">
        <div className="bg-ticket p-6">
          <Wallet className="size-6" />
          <h2 className="mt-3 font-heading text-[30px] leading-tight">Connect your NEAR wallet</h2>
          <p className="mt-2 text-muted-foreground">Your bond and your badge live on your own named account, like <span className="font-mono">yourfest.near</span>.</p>
          <button onClick={() => signIn("wallet")} disabled={!!busy} className="mt-5 inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 font-medium text-paper disabled:opacity-60">
            {busy === "wallet" && <Loader2 className="size-4 animate-spin" />} Connect wallet
          </button>
        </div>
        {NETWORK === "testnet" && (
          <div className="bg-ticket p-6">
            <FlaskConical className="size-6" />
            <h2 className="mt-3 font-heading text-[30px] leading-tight">Try it as a demo business</h2>
            <p className="mt-2 text-muted-foreground">
              No wallet needed. We create a testnet account in this browser and fund it with a little testnet NEAR.
            </p>
            <button onClick={() => signIn("demo")} disabled={!!busy} className="mt-5 inline-flex items-center gap-2 rounded-md border border-ink px-5 py-3 font-medium disabled:opacity-60">
              {busy === "demo" && <Loader2 className="size-4 animate-spin" />} Start demo business
            </button>
          </div>
        )}
        {error && <p className="bg-ticket p-4 text-sm text-claims md:col-span-2">{error}</p>}
      </div>
    );
  }

  const s = state;
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <span className="label">
          {signer.kind === "demo" ? "Demo business (testnet, key in this browser)" : "Wallet"} ·{" "}
          <a className="underline underline-offset-4" href={explorerAccount(signer.accountId)}>
            {signer.accountId.length > 30 ? `${signer.accountId.slice(0, 8)}…${signer.accountId.slice(-6)}` : signer.accountId}
          </a>{" "}
          · {s ? near(s.near) : "…"} NEAR
        </span>
        <button onClick={signOut} className="label inline-flex items-center gap-1.5 hover:text-ink">
          <LogOut className="size-3" /> {signer.kind === "demo" ? "Forget demo business" : "Disconnect"}
        </button>
      </div>

      {last && (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-protected">
          <Check className="size-4" /> {last.what} ·{" "}
          <a className="underline underline-offset-4" href={explorerTx(last.hash)}>transaction</a>
        </p>
      )}
      {error && <p className="mt-4 text-sm text-claims">{error}</p>}

      {!s ? (
        <p className="label mt-8">Reading your account…</p>
      ) : !s.biz ? (
        <Register busy={busy} onRegister={(name) => run("Business registered", PRESAFE_CONTRACT, "register_business", { name }, STORAGE_DEPOSIT)} />
      ) : (
        <>
          <section className="mt-8 grid items-end gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <div className="label">Your business</div>
              <h2 className="mt-1 font-heading text-[48px] leading-none">{s.biz.name}</h2>
            </div>
            <Link href={`/b/${s.biz.account_id}`} className="inline-flex items-center gap-1.5 rounded-md border border-ink px-4 py-2.5 text-sm font-medium">
              Public badge page <ArrowUpRight className="size-4" />
            </Link>
          </section>

          <BondSection s={s} busy={busy} run={run} accountId={signer.accountId} />

          <section className="mt-12">
            <h3 className="font-heading text-[34px]">Obligations</h3>
            {s.obligations.length === 0 && <p className="mt-2 text-muted-foreground">No obligations yet. Create one below to start taking protected payments.</p>}
            <div className="mt-2 divide-y divide-rule border-y border-rule">
              {[...s.obligations].reverse().map((o) => (
                <ObligationRow key={o.id} o={o} busy={busy} unlocked={BigInt(s.biz!.unlocked)} run={run} />
              ))}
            </div>
          </section>

          <NewObligation unlocked={BigInt(s.biz.unlocked)} busy={busy} run={run} />

          <section className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5 text-sm text-muted-foreground">
            <span>
              Storage balance for receipts: <span className="font-mono text-ink">{near(s.storageAvailable)} NEAR</span> available
              (about {Number(s.storageAvailable / 3_640_000_000_000_000_000_000n)} more payments).
            </span>
            <button
              onClick={() => run("Storage topped up", PRESAFE_CONTRACT, "storage_deposit", {}, STORAGE_DEPOSIT)}
              disabled={!!busy}
              className="rounded-md border border-rule px-3 py-2 text-ink disabled:opacity-60"
            >
              Add 0.05 NEAR
            </button>
          </section>
        </>
      )}
    </div>
  );
}

type Run = (what: string, contractId: string, method: string, args: object, deposit?: bigint, gas?: bigint) => Promise<boolean | undefined>;

function Register({ busy, onRegister }: { busy: string | null; onRegister: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <section className="mt-8 max-w-xl">
      <h2 className="font-heading text-[40px] leading-tight">Register your business</h2>
      <p className="mt-2 text-muted-foreground">
        The name appears on your public badge. Registering stores your business on the Presafe contract and attaches 0.05 NEAR
        to pay for the storage of your obligations and your customers&apos; receipts.
      </p>
      <label className="label mt-6 block" htmlFor="bizname">Business name</label>
      <input id="bizname" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} placeholder="Lagos Sound Fest" className="mt-1 w-full rounded-md border border-rule bg-ticket px-3 py-3 text-[17px]" />
      <button
        onClick={() => onRegister(name.trim())}
        disabled={!!busy || !name.trim()}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 font-medium text-paper disabled:opacity-50"
      >
        {busy === "Business registered" && <Loader2 className="size-4 animate-spin" />} Register
      </button>
    </section>
  );
}

function BondSection({ s, busy, run, accountId }: { s: State; busy: string | null; run: Run; accountId: string }) {
  const [fund, setFund] = useState("5");
  const [withdraw, setWithdraw] = useState("");
  const biz = s.biz!;

  async function mint() {
    const registered = await usdcRegistered(accountId).catch(() => false);
    await run("Got 10 test USDC", USDC_CONTRACT, "mint", { account_id: accountId, amount: (10n * UNIT).toString() }, registered ? 0n : MINT_DEPOSIT);
  }

  return (
    <section className="mt-8">
      <div className="grid grid-cols-2 gap-px border-y border-rule bg-rule md:grid-cols-4">
        {[
          ["Bond", fmt(biz.bond_total, false)],
          ["Reserved", fmt(biz.locked, false)],
          ["Unlocked", fmt(biz.unlocked, false)],
          ["In your wallet", fmt(s.usdc, false)],
        ].map(([k, v]) => (
          <div key={k} className="bg-paper py-4 pr-4 [&:not(:first-child)]:pl-4 max-md:[&:nth-child(3)]:pl-0">
            <div className="label">{k} · {TOKEN_LABEL}</div>
            <div className="mt-1 font-mono text-[26px]">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <div className="label">Add to your bond</div>
          <div className="mt-1 flex gap-2">
            <input value={fund} onChange={(e) => setFund(e.target.value)} inputMode="decimal" className="w-28 rounded-md border border-rule bg-ticket px-3 py-2.5 font-mono" />
            <button
              onClick={() => run("Bond funded", USDC_CONTRACT, "ft_transfer_call", { receiver_id: PRESAFE_CONTRACT, amount: toUnits(fund).toString(), msg: JSON.stringify({ action: "fund_bond" }) }, 1n, 100n * TGAS)}
              disabled={!!busy || toUnits(fund) === 0n || toUnits(fund) > s.usdc}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
            >
              {busy === "Bond funded" && <Loader2 className="size-4 animate-spin" />} Fund bond
            </button>
            {NETWORK === "testnet" && (
              <button onClick={mint} disabled={!!busy} className="inline-flex items-center gap-2 rounded-md border border-rule px-3 py-2.5 text-sm disabled:opacity-50">
                {busy === "Got 10 test USDC" && <Loader2 className="size-4 animate-spin" />} Get 10 test USDC
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Funding from another chain through NEAR Intents is mainnet-only and coming next.</p>
        </div>
        <div>
          <div className="label">Withdraw unlocked bond</div>
          <div className="mt-1 flex gap-2">
            <input value={withdraw} onChange={(e) => setWithdraw(e.target.value)} placeholder={fmt(biz.unlocked, false)} inputMode="decimal" className="w-28 rounded-md border border-rule bg-ticket px-3 py-2.5 font-mono" />
            <button
              onClick={() => run("Bond withdrawn", PRESAFE_CONTRACT, "withdraw_bond", { amount: toUnits(withdraw || fmt(biz.unlocked, false)).toString() }, 1n, 100n * TGAS)}
              disabled={!!busy || BigInt(biz.unlocked) === 0n}
              className="inline-flex items-center gap-2 rounded-md border border-ink px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {busy === "Bond withdrawn" && <Loader2 className="size-4 animate-spin" />} Withdraw
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Bond reserved for open obligations stays locked until they are delivered.</p>
        </div>
      </div>
    </section>
  );
}

function ObligationRow({ o, busy, unlocked, run }: { o: Obligation; busy: string | null; unlocked: bigint; run: Run }) {
  const [copied, setCopied] = useState(false);
  const [extra, setExtra] = useState("");
  const now = BigInt(Date.now()) * 1_000_000n;
  const canMark = o.status === "Open" && now >= BigInt(o.deliver_by_ns) && now < BigInt(o.default_after_ns);
  const canRelease = o.status === "MarkedDelivered" && o.challenge_ends_at_ns !== null && now >= BigInt(o.challenge_ends_at_ns);
  const settled = o.status === "Delivered" || o.status === "Defaulted";
  const tone = o.status === "Defaulted" ? "tone-claims" : o.status === "Delivered" ? "tone-delivered" : "tone-protected";
  const payLink = typeof window === "undefined" ? `/pay/${o.id}` : `${window.location.origin}/pay/${o.id}`;
  const id = { obligation_id: o.id };

  return (
    <div className={`grid gap-3 py-5 ${tone}`}>
      <div>
        <div className="label">#{o.id} · <span className="text-[var(--tone)]">{statusText(o)}</span></div>
        <div className="mt-1 font-heading text-[26px] leading-tight">{o.title}</div>
        <div className="mt-1 font-mono text-[13px] text-muted-foreground">
          Deliver by {when(o.deliver_by_ns)} · {o.receipt_count} paid {fmt(o.covered_total)} · reserve {fmt(o.reserve)} · coverage {coveragePct(o.coverage_bps) ?? "—"}
          {o.status === "MarkedDelivered" && o.challenge_ends_at_ns && <> · customers can dispute until {when(o.challenge_ends_at_ns)}</>}
          {o.status === "Defaulted" && <> · {fmt(o.claimed_total)} claimed</>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {o.status === "Open" && (
          <button
            onClick={() => navigator.clipboard.writeText(payLink).then(() => setCopied(true)).catch(() => {})}
            className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 text-sm"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy pay link"}
          </button>
        )}
        {canMark && (
          <button onClick={() => run(`Marked #${o.id} delivered`, PRESAFE_CONTRACT, "mark_delivered", id)} disabled={!!busy} className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-paper disabled:opacity-50">
            Mark delivered
          </button>
        )}
        {o.status === "Open" && now < BigInt(o.deliver_by_ns) && (
          <span className="label">Mark delivered after {day(o.deliver_by_ns)}</span>
        )}
        {canRelease && (
          <button onClick={() => run(`Released bond for #${o.id}`, PRESAFE_CONTRACT, "release", id)} disabled={!!busy} className="rounded-md bg-protected px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            Release bond
          </button>
        )}
        {o.status === "Open" && (
          <span className="inline-flex gap-1">
            <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="+ reserve" inputMode="decimal" className="w-24 rounded-md border border-rule bg-ticket px-2 py-2 font-mono text-sm" />
            <button
              onClick={() => run(`Added reserve to #${o.id}`, PRESAFE_CONTRACT, "add_reserve", { ...id, amount: toUnits(extra).toString() })}
              disabled={!!busy || toUnits(extra) === 0n || toUnits(extra) > unlocked}
              className="rounded-md border border-rule px-3 py-2 text-sm disabled:opacity-50"
            >
              Add
            </button>
          </span>
        )}
        {!settled && (
          <button
            onClick={() => window.confirm("Admit this obligation was not delivered? Customers can then claim from the reserve.") && run(`Declared #${o.id} not delivered`, PRESAFE_CONTRACT, "declare_default", id)}
            disabled={!!busy}
            className="rounded-md px-2 py-2 text-sm text-claims underline underline-offset-4 disabled:opacity-50"
          >
            Can&apos;t deliver
          </button>
        )}
      </div>
    </div>
  );
}

const WINDOWS: [string, bigint][] = [
  ["2 minutes (demo)", 2n * MIN],
  ["1 hour", HOUR],
  ["1 day", DAY],
  ["3 days", 3n * DAY],
];

function NewObligation({ unlocked, busy, run }: { unlocked: bigint; busy: string | null; run: Run }) {
  const [title, setTitle] = useState("");
  const [deliverBy, setDeliverBy] = useState("");
  const [reserve, setReserve] = useState("");
  const [grace, setGrace] = useState(DAY);
  const [window_, setWindow] = useState(3n * DAY);

  const quick = (minutes: number, demo: boolean) => {
    const d = new Date(Date.now() + minutes * 60_000);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    setDeliverBy(local);
    if (demo) {
      setGrace(2n * MIN);
      setWindow(2n * MIN);
    }
  };

  const deliverNs = deliverBy ? BigInt(new Date(deliverBy).getTime()) * 1_000_000n : 0n;
  const reserveUnits = toUnits(reserve);
  const valid = title.trim() && deliverNs > BigInt(Date.now()) * 1_000_000n && reserveUnits > 0n && reserveUnits <= unlocked;

  async function create() {
    const ok = await run("Obligation created", PRESAFE_CONTRACT, "create_obligation", {
      title: title.trim(),
      deliver_by_ns: deliverNs.toString(),
      reserve: reserveUnits.toString(),
      grace_ns: grace.toString(),
      challenge_window_ns: window_.toString(),
    });
    if (ok) {
      setTitle("");
      setReserve("");
    }
  }

  return (
    <section className="mt-12 rounded-md border border-rule bg-ticket p-6">
      <h3 className="font-heading text-[34px] leading-none">New obligation</h3>
      <p className="mt-2 text-muted-foreground">An event, tour or order you are taking money for. Reserve part of your unlocked bond to cover it.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="label">Title</span>
          <input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Lagos Sound Fest: Friday Night Session" className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2.5" />
        </label>
        <label className="block">
          <span className="label">Deliver by (your local time)</span>
          <input type="datetime-local" value={deliverBy} onChange={(e) => setDeliverBy(e.target.value)} className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2.5 font-mono" />
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {NETWORK === "testnet" && <Chip onClick={() => quick(3, true)}>In 3 min (demo)</Chip>}
            <Chip onClick={() => quick(60 * 24 * 7, false)}>In 1 week</Chip>
            <Chip onClick={() => quick(60 * 24 * 30, false)}>In 30 days</Chip>
          </span>
        </label>
        <label className="block">
          <span className="label">Reserve · {TOKEN_LABEL} (unlocked: {fmt(unlocked, false)})</span>
          <input value={reserve} onChange={(e) => setReserve(e.target.value)} inputMode="decimal" placeholder="5" className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2.5 font-mono" />
        </label>
        <label className="block">
          <span className="label">Grace period before claims open</span>
          <select value={grace.toString()} onChange={(e) => setGrace(BigInt(e.target.value))} className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2.5">
            {WINDOWS.map(([l, v]) => <option key={l} value={v.toString()}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Customers can dispute delivery for</span>
          <select value={window_.toString()} onChange={(e) => setWindow(BigInt(e.target.value))} className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2.5">
            {WINDOWS.map(([l, v]) => <option key={l} value={v.toString()}>{l}</option>)}
          </select>
        </label>
      </div>
      <button onClick={create} disabled={!!busy || !valid} className="mt-6 inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 font-medium text-paper disabled:opacity-50">
        {busy === "Obligation created" && <Loader2 className="size-4 animate-spin" />} Create obligation
      </button>
      {reserveUnits > unlocked && <p className="mt-2 text-sm text-claims">That is more than your unlocked bond. Fund your bond first.</p>}
    </section>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-rule px-2.5 py-1 text-xs text-muted-foreground hover:border-ink hover:text-ink">
      {children}
    </button>
  );
}

