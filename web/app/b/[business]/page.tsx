import Link from "next/link";
import { notFound } from "next/navigation";
import { explorerAccount, PRESAFE_CONTRACT } from "@/lib/config";
import { amount, coveragePct, headline, obligationTone, statusLabel, when } from "@/lib/format";
import { getBusiness, listObligations } from "@/lib/near";

export const dynamic = "force-dynamic";

export default async function BadgePage({ params }: { params: Promise<{ business: string }> }) {
  const { business } = await params;
  const b = await getBusiness(business);
  if (!b) notFound();
  const obligations = await listObligations(business);
  const h = headline(b, obligations);

  return (
    <>
      <p className="muted" style={{ margin: "32px 0 4px" }}>
        <a className="mono" href={explorerAccount(b.account_id)}>
          {b.account_id}
        </a>
      </p>
      <h1>{b.name}</h1>

      <div className={`headline tone-${h.tone}`}>
        <span className="dot" />
        <p>{h.text}</p>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="k">Bond</div>
          <div className="v">{amount(b.bond_total, false)}</div>
        </div>
        <div className="stat">
          <div className="k">Prepayments covered</div>
          <div className="v">{amount(b.total_covered, false)}</div>
        </div>
        <div className="stat">
          <div className="k">Claims paid</div>
          <div className="v">
            {b.claims_paid_count} · {amount(b.claims_paid_amount, false)}
          </div>
        </div>
        <div className="stat">
          <div className="k">Arbiter</div>
          <div className="v" style={{ fontSize: 14, paddingTop: 6 }}>
            {b.arbiter}
          </div>
        </div>
      </div>

      <h2>Obligations</h2>
      {obligations.length === 0 && <p className="muted">No obligations yet.</p>}
      {obligations.map((o) => {
        const tone = obligationTone(o);
        const pct = coveragePct(o.coverage_bps);
        return (
          <div key={o.id} className={`stub tone-${tone}`}>
            <div className="main">
              <span className="badge-status">{statusLabel[o.status]}</span>
              <h3>{o.title}</h3>
              <div className="timeline">
                <span>Deliver by {when(o.deliver_by_ns)}</span>
                {o.status === "Open" && <span>Claims open after {when(o.default_after_ns)} if not delivered</span>}
                {o.challenge_ends_at_ns && o.status === "MarkedDelivered" && (
                  <span>Customers can dispute until {when(o.challenge_ends_at_ns)}</span>
                )}
              </div>
              <div className="timeline">
                <span>{o.receipt_count} paid</span>
                <span>{amount(o.covered_total)} covered</span>
                {o.status === "Defaulted" && <span>{amount(o.claimed_total)} claimed</span>}
                {o.status === "Open" && (
                  <Link href={`/pay/${o.id}`} style={{ color: "var(--ink)", fontWeight: 600 }}>
                    Pay with protection →
                  </Link>
                )}
              </div>
            </div>
            <div className="side">
              <div className="pct">{pct ?? "—"}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {pct ? "coverage" : "no prepayments yet"}
              </div>
              <div className="mono" style={{ fontSize: 13, marginTop: 6 }}>
                {amount(o.reserve)} reserved
              </div>
            </div>
          </div>
        );
      })}

      <h2>Put this badge on your ticket page</h2>
      <div className="embed">{`<a href="https://<presafe-host>/b/${b.account_id}"><img src="https://<presafe-host>/b/${b.account_id}/badge.svg" alt="Protected by Presafe"></a>`}</div>
      <p className="muted" style={{ fontSize: 14 }}>
        Every number on this page is read live from the{" "}
        <a className="mono" href={explorerAccount(PRESAFE_CONTRACT)}>
          {PRESAFE_CONTRACT}
        </a>{" "}
        contract. No wallet needed.
      </p>
    </>
  );
}
