import type { Metadata } from "next";
import { CheckForm } from "@/components/public/CheckForm";
import { PublicChrome } from "@/components/public/PublicChrome";
import { ScreenFrame } from "@/components/app/ScreenFrame";

export const metadata: Metadata = {
  title: "Check a statement",
  description:
    "Paste an Orru statement id. Anyone can open it. It shows a range, never an exact amount.",
};

const DISCLOSURE =
  "This does not prove future income, affordability, legal credit eligibility, or guaranteed repayment.";

export default function CheckPage() {
  return (
    <PublicChrome>
      <ScreenFrame
        kicker="Public check"
        title="Check a statement."
        lede="Paste the short id or the long 0x id. You will see a range and a dated window, never an exact amount."
      >
        <CheckForm />
        <div className="mt-16 max-w-xl border-t-2 border-rule-strong pt-6">
          <p className="eyebrow text-ink-faint">What this does not show</p>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{DISCLOSURE}</p>
        </div>
      </ScreenFrame>
    </PublicChrome>
  );
}
