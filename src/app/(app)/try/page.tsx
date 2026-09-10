import type { Metadata } from "next";
import { Suspense } from "react";
import { FaucetScreen } from "@/components/app/FaucetScreen";
import { ScreenSkeleton } from "@/components/app/ScreenFrame";

export const metadata: Metadata = {
  title: "Try it",
  description: "Give a wallet a demo income history and walk the whole journey.",
};

export default function TryPage() {
  return (
    <Suspense
      fallback={<ScreenSkeleton kicker="Try it" title="Give this wallet an income history." />}
    >
      <FaucetScreen />
    </Suspense>
  );
}
