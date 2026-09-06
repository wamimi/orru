/**
 * Income is served from the worker snapshot, not a Sepolia log scan.
 * Kept so existing imports do not break.
 */
export { incomesForAddress } from "@/lib/snapshot";
