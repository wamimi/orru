import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";

export function SectionTag({ children }: { children: ReactNode }) {
  return (
    <div className="mkt-section-tag">
      <Mark size={16} />
      <span>{children}</span>
    </div>
  );
}
