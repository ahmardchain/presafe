import type { Metadata } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import { cn } from "@/lib/utils";
import { StubMark } from "@/components/Stub";
import { NETWORK, PRESAFE_CONTRACT, explorerAccount } from "@/lib/config";

export const metadata: Metadata = {
  title: "Presafe",
  description: "Paid upfront. Protected anyway. Businesses post a USDC bond on NEAR; if they don't deliver, customers claim it back.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(GeistSans.variable, GeistMono.variable, "font-sans antialiased")}>
      <body className="bg-paper text-ink min-h-screen">
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-[19px] font-semibold tracking-tight">
            <StubMark size={26} />
            presafe
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <span className="label rounded-full border border-rule px-2 py-0.5">{NETWORK}</span>
            <Link className="hover:text-ink hidden sm:inline" href="/claims">Claims</Link>
            <Link className="hover:text-ink" href="/business">For businesses</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mx-auto mt-24 flex max-w-6xl flex-wrap justify-between gap-2 border-t border-rule px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <span>
            Contract{" "}
            <a className="font-mono underline underline-offset-4" href={explorerAccount(PRESAFE_CONTRACT)}>
              {PRESAFE_CONTRACT}
            </a>{" "}
            on NEAR {NETWORK}
          </span>
          <span>Built at NEAR HACKATHON · MIT</span>
        </footer>
      </body>
    </html>
  );
}
