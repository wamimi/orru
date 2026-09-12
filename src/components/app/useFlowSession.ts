"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "orru.flow";
const EVENT = "orru:flow-session";

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
  credentialTxHash: string | null;
  faucetAddress: string | null;
  faucetTxHash: string | null;
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
  credentialTxHash: null,
  faucetAddress: null,
  faucetTxHash: null,
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
    const onSession = (event: Event) => {
      const detail = (event as CustomEvent<FlowSession>).detail;
      if (detail) setSession(detail);
    };
    window.addEventListener(EVENT, onSession);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(EVENT, onSession);
    };
  }, []);

  const update = useCallback((partial: Partial<FlowSession>) => {
    setSession((current) => {
      const next = { ...current, ...partial };
      sessionStorage.setItem(KEY, JSON.stringify(next));
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
      });
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    sessionStorage.removeItem(KEY);
    setSession(empty);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: empty }));
  }, []);

  return { session, ready, update, clear };
}
