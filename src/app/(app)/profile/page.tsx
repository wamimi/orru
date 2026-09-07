import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileScreen } from "@/components/app/ProfileScreen";
import { ScreenSkeleton } from "@/components/app/ScreenFrame";

export const metadata: Metadata = {
  title: "Income profile",
  description: "Your verified income band, period count, and credential status.",
};

export default function ProfilePage() {
  return (
    <Suspense
      fallback={<ScreenSkeleton kicker="03 · Profile" title="Your income, as a band." />}
    >
      <ProfileScreen />
    </Suspense>
  );
}
