"use client";

import { CopyButton } from "@/components/ui/CopyButton";

export function CopyableId({
  value,
  display,
}: {
  value: string;
  display?: string;
}) {
  return (
    <span className="copyable-id">
      <code>{display ?? value}</code>
      <CopyButton value={value} label="Copy statement id" />
    </span>
  );
}
