import type { Metadata } from "next";
import { Suspense } from "react";
import { CredentialScreen } from "@/components/app/CredentialScreen";
import { ScreenSkeleton } from "@/components/app/ScreenFrame";

export const metadata: Metadata = {
  title: "Credential",
  description:
    "The fields a lender receives, and the fields that stay out of the credential.",
};

export default function CredentialPage() {
  return (
    <Suspense
      fallback={<ScreenSkeleton kicker="04 · Credential" title="This is what leaves." />}
    >
      <CredentialScreen />
    </Suspense>
  );
}
