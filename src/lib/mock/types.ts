import type { EvidenceState } from "@/components/ui/EvidenceBadge";
import type { CredentialData } from "@/components/ui/CredentialCard";

/** Forced screen outcome, used for QA via `?state=`. */
export type ScreenOutcome = "loading" | "empty" | "error" | "success";

export type NetworkId = "creditcoin" | "unsupported";

export type Subject = {
  address: string;
  displayAddress: string;
  network: NetworkId;
  connected: boolean;
  signed: boolean;
};

export type Payment = {
  id: string;
  received: string;
  period: string;
  payer: string;
  recognised: boolean;
  evidence: EvidenceState;
};

export type IssuedCredential = CredentialData & {
  policyVersion: string;
  issuedAt: string;
  expiresAt: string;
  issuanceRef: string;
};

export type ConsentRequest = {
  id: string;
  party: string;
  purpose: string;
  expires: string;
  fields: string[];
};

export type PolicyResult = {
  version: string;
  outcome: "pass" | "fail" | "review";
  reasonCodes: string[];
  offerBucket: string;
};

export type Recovery = {
  title: string;
  body: string;
  actionLabel: string;
  actionHref?: string;
};
