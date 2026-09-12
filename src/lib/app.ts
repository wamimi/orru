import type { ScreenOutcome } from "@/lib/mock/types";

export const appSteps = [
  { id: "connect", href: "/connect", label: "Connect", number: "01" },
  { id: "review", href: "/review", label: "Review", number: "02" },
  { id: "profile", href: "/profile", label: "Profile", number: "03" },
  { id: "credential", href: "/credential", label: "Credential", number: "04" },
  { id: "consent", href: "/consent", label: "Share", number: "05" },
  { id: "borrow", href: "/borrow", label: "Borrow", number: "06" },
] as const;

export type AppStepId = (typeof appSteps)[number]["id"];

export function parseOutcome(value: string | null): ScreenOutcome | null {
  if (value === "loading" || value === "empty" || value === "error" || value === "success") {
    return value;
  }
  return null;
}

export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
