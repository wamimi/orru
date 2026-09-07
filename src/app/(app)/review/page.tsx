import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewScreen } from "@/components/app/ReviewScreen";
import { ScreenSkeleton } from "@/components/app/ScreenFrame";

export const metadata: Metadata = {
  title: "Review income",
  description:
    "Payments are found, then confirmed against the chain before they can count.",
};

export default function ReviewPage() {
  return (
    <Suspense
      fallback={<ScreenSkeleton kicker="02 · Review" title="Each payment is found, then confirmed." />}
    >
      <ReviewScreen />
    </Suspense>
  );
}
