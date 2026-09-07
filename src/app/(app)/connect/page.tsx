import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectScreen } from "@/components/app/ConnectScreen";
import { ScreenSkeleton } from "@/components/app/ScreenFrame";

export const metadata: Metadata = {
  title: "Connect",
  description:
    "Connect the wallet you get paid into and sign a short message to show the address is yours.",
};

export default function ConnectPage() {
  return (
    <Suspense
      fallback={<ScreenSkeleton kicker="01 · Connect" title="Connect the wallet you get paid into." />}
    >
      <ConnectScreen />
    </Suspense>
  );
}
