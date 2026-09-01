export type EvidenceState =
  | "verified"
  | "attested"
  | "found"
  | "pending"
  | "failed";

const states: Record<EvidenceState, { label: string; bg: string; fg: string }> = {
  verified: {
    label: "Verified",
    bg: "var(--ev-verified-bg)",
    fg: "var(--ev-verified-fg)",
  },
  attested: {
    label: "Chain-confirmed",
    bg: "var(--ev-attested-bg)",
    fg: "var(--ev-attested-fg)",
  },
  found: {
    label: "Found, unconfirmed",
    bg: "var(--ev-found-bg)",
    fg: "var(--ev-found-fg)",
  },
  pending: {
    label: "Checking",
    bg: "var(--ev-pending-bg)",
    fg: "var(--ev-pending-fg)",
  },
  failed: {
    label: "Not accepted",
    bg: "var(--ev-failed-bg)",
    fg: "var(--ev-failed-fg)",
  },
};

export function EvidenceBadge({
  state,
  label,
}: {
  state: EvidenceState;
  label?: string;
}) {
  const config = states[state];

  return (
    <span
      className="eyebrow inline-flex shrink-0 items-center rounded-full px-2.5 py-1"
      style={{ background: config.bg, color: config.fg, letterSpacing: "0.1em" }}
    >
      {label ?? config.label}
    </span>
  );
}
