import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";

export function Callout({
  tone = "info",
  title,
  body,
  actionLabel,
  actionHref,
  children,
}: {
  tone?: "info" | "empty" | "error";
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  children?: ReactNode;
}) {
  const rule =
    tone === "error"
      ? "border-[color:var(--ev-failed-fg)]"
      : tone === "empty"
        ? "border-ink-faint"
        : "border-rule-strong";

  return (
    <div className={`border-t-2 pt-6 md:pt-8 ${rule}`}>
      <p className="display-md max-w-md text-ink">{title}</p>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-ink-soft">
        {body}
      </p>
      {children}
      {actionLabel && actionHref ? (
        <div className="mt-6">
          <ButtonLink href={actionHref}>{actionLabel}</ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
