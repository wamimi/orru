import type { Payment } from "./types";

export const demoPayments: Payment[] = [
  {
    id: "pay-01",
    received: "6 days ago",
    period: "Period 4",
    payer: "Recognised payer",
    recognised: true,
    evidence: "attested",
  },
  {
    id: "pay-02",
    received: "35 days ago",
    period: "Period 3",
    payer: "Recognised payer",
    recognised: true,
    evidence: "attested",
  },
  {
    id: "pay-03",
    received: "66 days ago",
    period: "Period 2",
    payer: "Recognised payer",
    recognised: true,
    evidence: "attested",
  },
  {
    id: "pay-04",
    received: "97 days ago",
    period: "Period 1",
    payer: "Recognised payer",
    recognised: true,
    evidence: "attested",
  },
];

export const unrecognisedPayments: Payment[] = [
  ...demoPayments.slice(0, 3),
  {
    id: "pay-04",
    received: "97 days ago",
    period: "Period 1",
    payer: "Unknown sender",
    recognised: false,
    evidence: "failed",
  },
];
