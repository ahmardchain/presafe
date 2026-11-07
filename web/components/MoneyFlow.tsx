"use client";

import { useRef } from "react";
import { AnimatedBeam } from "@/components/ui/animated-beam";

function Node({ refEl, label, sub }: { refEl: React.RefObject<HTMLDivElement | null>; label: string; sub: string }) {
  return (
    <div ref={refEl} className="z-10 w-[150px] rounded-md border border-white/15 bg-[#17191c] px-4 py-3 sm:w-[190px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">{sub}</div>
      <div className="text-[15px] font-medium text-white">{label}</div>
    </div>
  );
}

/** Where the money goes: payment straight to the business, bond held by the contract, claims back to the customer. */
export function MoneyFlow() {
  const box = useRef<HTMLDivElement>(null);
  const customer = useRef<HTMLDivElement>(null);
  const business = useRef<HTMLDivElement>(null);
  const bond = useRef<HTMLDivElement>(null);
  return (
    <div ref={box} className="relative grid grid-cols-2 gap-y-20 py-6 sm:gap-y-24">
      <div className="justify-self-start"><Node refEl={customer} sub="Customer" label="Pays 2.00 USDC" /></div>
      <div className="justify-self-end"><Node refEl={business} sub="Business" label="Gets it instantly" /></div>
      <div className="col-span-2 justify-self-center"><Node refEl={bond} sub="Presafe contract" label="Holds the bond" /></div>
      <AnimatedBeam containerRef={box} fromRef={customer} toRef={business} pathColor="#ffffff" pathOpacity={0.12} gradientStartColor="#7ee0b8" gradientStopColor="#2fa784" duration={3} />
      <AnimatedBeam containerRef={box} fromRef={business} toRef={bond} curvature={-40} pathColor="#ffffff" pathOpacity={0.12} gradientStartColor="#7ee0b8" gradientStopColor="#2fa784" duration={3} delay={1} />
      <AnimatedBeam containerRef={box} fromRef={bond} toRef={customer} curvature={-40} pathColor="#ffffff" pathOpacity={0.12} gradientStartColor="#ff9a6b" gradientStopColor="#e5481b" duration={3} delay={2} />
    </div>
  );
}
