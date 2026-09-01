import type { ReactNode } from "react";

export function MetaRow({
  label,
  value,
  trailing,
}: {
  label: string;
  value: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-3 last:border-b-0">
      <span className="eyebrow text-ink-faint">{label}</span>
      <span className="flex items-center gap-3">
        <span className="meta whitespace-nowrap text-ink">{value}</span>
        {trailing}
      </span>
    </div>
  );
}
