import type { Metadata } from "next";
import { Suspense } from "react";
import { FaucetScreen } from "@/components/app/FaucetScreen";
import { ScreenSkeleton } from "@/components/app/ScreenFrame";

export const metadata: Metadata = {
  title: "Demo faucet",
  description: "Create a demo income history with no ETH or CTC required.",
};

export default function TryPage() {
  return (
    <Suspense
      fallback={
        <ScreenSkeleton
          kicker="Demo faucet"
          title="Give this wallet an income history."
        />
      }
    >
      <FaucetScreen />
    </Suspense>
  );
}
