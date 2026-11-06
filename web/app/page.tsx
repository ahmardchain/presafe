import Link from "next/link";
import { DEMO_BUSINESS } from "@/lib/config";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <h1>Paid upfront. Protected anyway.</h1>
          <p className="lede">
            Businesses post a USDC bond on NEAR and get a public badge. If they don&apos;t deliver by the promised date,
            the customers who paid them claim it back, with no gas and from any chain.
          </p>
          <p>
            <Link className="btn primary" href={`/b/${DEMO_BUSINESS}`}>
              See a live bond
            </Link>
            <Link className="btn" href="/business">
              Post a bond
            </Link>
          </p>
        </div>
        <Link className="live" href={`/b/${DEMO_BUSINESS}`} aria-label="Live badge of the demo business">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/b/${DEMO_BUSINESS}/badge.svg`} alt="Live Presafe badge for the demo business" />
          <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>
            Live from the contract. Demo business: Lagos Sound Fest (fictional).
          </p>
        </Link>
      </section>

      <p className="proof">
        <b>11 of 521</b> ticket buyers got their money back after New York&apos;s cancelled Evolutions Festival, and only
        through card disputes. No escrow or financial protection was held.{" "}
        <a href="https://www.fingerlakes1.com/2026/09/30/new-york-sues-canceled-festival-promoters-over-refunds/">
          FingerLakes1, Sep 30 2026
        </a>
      </p>

      <h2>How it works</h2>
      <div className="steps">
        <div className="stub tone-protected">
          <span className="badge-status">1. Bond</span>
          <p>The business locks USDC as a bond and reserves part of it for each event or order.</p>
        </div>
        <div className="stub tone-protected">
          <span className="badge-status">2. Pay</span>
          <p>Customers pay through Presafe. The business gets the money at once; this is not escrow.</p>
        </div>
        <div className="stub tone-claims">
          <span className="badge-status">3. Deliver or claim</span>
          <p>No delivery by the deadline? Anyone can trigger default, and each customer claims their share.</p>
        </div>
      </div>

      <h2>Why a bond, not escrow</h2>
      <p>
        Escrow locks presale cash that organizers need to pay venues and artists, so they avoid it. A bond lets the
        business keep and use the money while customers stay protected up to the bond.
      </p>
    </>
  );
}
