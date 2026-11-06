import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Wordmark } from "@/components/Stub";
import { NETWORK, PRESAFE_CONTRACT, explorerAccount } from "@/lib/config";

export const metadata: Metadata = {
  title: "Presafe",
  description: "Paid upfront. Protected anyway. Businesses post a USDC bond on NEAR; if they don't deliver, customers claim it back.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;600&display=swap"
        />
      </head>
      <body>
        <header className="site">
          <div className="wrap">
            <Link href="/" style={{ textDecoration: "none" }}>
              <Wordmark />
            </Link>
            <nav>
              <span className="netpill">{NETWORK}</span>
              <Link href="/claims">Claims</Link>
              <Link href="/business">For businesses</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site">
          <div className="wrap">
            Contract{" "}
            <a className="mono" href={explorerAccount(PRESAFE_CONTRACT)}>
              {PRESAFE_CONTRACT}
            </a>{" "}
            on NEAR {NETWORK}. Built at NEAR HACKATHON. MIT licensed.
          </div>
        </footer>
      </body>
    </html>
  );
}
