import { ClaimsPanel } from "@/components/claims/ClaimsPanel";

export const metadata = { title: "Your receipts · Presafe" };

export default function ClaimsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 md:pt-14">
      <div className="label">Claims</div>
      <h1 className="mt-2 font-heading text-[48px] leading-[0.98] sm:text-[64px]">Your receipts</h1>
      <p className="mt-4 max-w-[34em] text-[17px] text-muted-foreground">
        Every payment you made with protection. If a business misses its deadline, claim here: no wallet, no gas.
      </p>
      <ClaimsPanel />
    </div>
  );
}
