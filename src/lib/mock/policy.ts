import type { ConsentRequest, PolicyResult } from "./types";

export const demoRequest: ConsentRequest = {
  id: "orru-req-04a1",
  party: "Northwind Advances",
  purpose: "Income check for a sandbox credit offer",
  expires: "in 7 days",
  fields: [
    "Income band",
    "Consecutive periods",
    "Most recent payment",
    "Payer recognised",
    "Credential status",
  ],
};

export const expiredRequest: ConsentRequest = {
  ...demoRequest,
  id: "orru-req-expired",
  expires: "expired 2 days ago",
};

export const demoPolicy: PolicyResult = {
  version: "orru-income-v1",
  outcome: "pass",
  reasonCodes: ["band-in-range", "periods-met", "fresh-enough", "payer-recognised"],
  offerBucket: "sandbox-advance",
};
