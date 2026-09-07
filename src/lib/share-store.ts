export type ShareConsent = {
  requestId: string;
  address: string;
  consentedAt: string;
};

const consents = new Map<string, ShareConsent>();

export function recordConsent(requestId: string, address: string): ShareConsent {
  const entry = {
    requestId,
    address,
    consentedAt: new Date().toISOString(),
  };
  consents.set(`${requestId}:${address.toLowerCase()}`, entry);
  return entry;
}

export function hasConsent(requestId: string, address: string): boolean {
  return consents.has(`${requestId}:${address.toLowerCase()}`);
}

export function getConsent(requestId: string, address: string): ShareConsent | null {
  return consents.get(`${requestId}:${address.toLowerCase()}`) ?? null;
}
