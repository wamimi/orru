import { EvidenceBadge, type EvidenceState } from "./EvidenceBadge";

export type SharedField = {
  label: string;
  value: string;
  state?: EvidenceState;
};

export function SharedFields({ fields }: { fields: SharedField[] }) {
  return (
    <ul className="divide-y divide-rule">
      {fields.map((field) => (
        <li
          key={field.label}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4"
        >
          <span className="text-sm text-ink-soft">{field.label}</span>
          <span className="flex items-center gap-3">
            <span className="meta text-ink">{field.value}</span>
            {field.state ? <EvidenceBadge state={field.state} /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HiddenFields({ fields }: { fields: string[] }) {
  return (
    <ul className="divide-y divide-rule">
      {fields.map((field) => (
        <li
          key={field}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4"
        >
          <span className="text-sm text-ink-soft">{field}</span>
          <span
            className="meta select-none rounded px-2 py-0.5 text-ink-faint"
            style={{
              background:
                "repeating-linear-gradient(-45deg, var(--rule) 0 2px, transparent 2px 6px)",
            }}
            aria-label="Withheld"
          >
            withheld
          </span>
        </li>
      ))}
    </ul>
  );
}
