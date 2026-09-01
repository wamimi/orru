import { sampleCredential } from "@/components/ui/CredentialCard";
import type { IssuedCredential } from "./types";

export const demoCredential: IssuedCredential = {
  ...sampleCredential,
  policyVersion: "orru-income-v1",
  issuedAt: "12 Aug 2026",
  expiresAt: "12 Nov 2026",
  issuanceRef: "ctc:cred:8f41c2a7",
};

export const sharedWithLender = [
  { label: "Income band", value: demoCredential.band, state: "verified" as const },
  { label: "Consecutive periods", value: "4", state: "verified" as const },
  {
    label: "Most recent payment",
    value: demoCredential.lastPayment,
    state: "attested" as const,
  },
  { label: "Payer recognised", value: "yes", state: "attested" as const },
  { label: "Credential status", value: "valid", state: "verified" as const },
];

export const withheldFromLender = [
  "Exact amount of each payment",
  "Who your clients or employer are",
  "Your address's full payment history",
  "Any other balance you hold",
];
