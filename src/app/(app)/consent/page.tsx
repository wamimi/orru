import type { Metadata } from "next";
import { Suspense } from "react";
import { ConsentScreen } from "@/components/app/ConsentScreen";
import { ScreenSkeleton } from "@/components/app/ScreenFrame";

export const metadata: Metadata = {
  title: "Share",
  description:
    "Choose which fields to share, with whom, and for how long. You can stop sharing later.",
};

export default function ConsentPage() {
  return (
    <Suspense
      fallback={<ScreenSkeleton kicker="05 · Share" title="Share these fields, for this window." />}
    >
      <ConsentScreen />
    </Suspense>
  );
}
