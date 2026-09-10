import type { Metadata } from "next";
import { Suspense } from "react";
import { BorrowScreen } from "@/components/app/BorrowScreen";
import { ScreenSkeleton } from "@/components/app/ScreenFrame";

export const metadata: Metadata = {
  title: "Borrow",
  description: "Draw against the income you have already proved.",
};

export default function BorrowPage() {
  return (
    <Suspense
      fallback={<ScreenSkeleton kicker="Borrow" title="Draw against what you earn." />}
    >
      <BorrowScreen />
    </Suspense>
  );
}
