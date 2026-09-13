"use client";

import { useSyncExternalStore } from "react";
import { formatWhen } from "@/lib/dates";

const noop = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

/**
 * A chain timestamp in the viewer's time zone. The server renders the UTC
 * form; the browser shows local time once hydrated.
 */
export function LocalWhen({ iso, fallback }: { iso: string | null; fallback?: string }) {
  const hydrated = useHydrated();
  if (!iso) return <>{fallback ?? "Not recorded"}</>;
  if (!hydrated) {
    return <>{`${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`}</>;
  }
  return <>{formatWhen(iso, fallback)}</>;
}
