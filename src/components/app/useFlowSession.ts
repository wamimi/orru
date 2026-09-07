"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "orru.flow";

import type { IncomeLookup } from "@/lib/income-types";

export type FlowSession = {
  connected: boolean;
  signed: boolean;
  requestId: string | null;
  address: string | null;
  sessionToken: string | null;
  income: IncomeLookup | null;
  incomes: IncomeLookup[];
  credentialId: string | null;
};

const empty: FlowSession = {
  connected: false,
  signed: false,
  requestId: null,
  address: null,
  sessionToken: null,
  income: null,
  incomes: [],
  credentialId: null,
};

export function useFlowSession() {
  const [session, setSession] = useState<FlowSession>(empty);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem(KEY);
        if (raw) setSession({ ...empty, ...JSON.parse(raw) });
      } catch {
        /* ignore */
      }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const update = useCallback((partial: Partial<FlowSession>) => {
    setSession((current) => {
      const next = { ...current, ...partial };
      sessionStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    sessionStorage.removeItem(KEY);
    setSession(empty);
  }, []);

  return { session, ready, update, clear };
}
