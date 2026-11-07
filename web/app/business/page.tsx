import { BusinessApp } from "@/components/business/BusinessApp";

export const metadata = { title: "For businesses · Presafe" };

export default function BusinessPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 md:pt-14">
      <div className="label">For businesses</div>
      <h1 className="mt-2 font-heading text-[48px] leading-[0.98] sm:text-[72px]">Post a bond. Win the presale.</h1>
      <p className="mt-4 max-w-[36em] text-[17px] text-muted-foreground">
        Keep every payment the moment it arrives. Your bond, shown on a public badge, tells customers you will deliver,
        or they get paid back from it.
      </p>
      <BusinessApp />
    </div>
  );
}
