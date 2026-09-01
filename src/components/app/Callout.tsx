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
  const border =
    tone === "error"
      ? "border-[color:var(--ev-failed-fg)]/25"
      : "border-rule";

  return (
    <div className={`rounded-card border bg-paper px-5 py-5 ${border}`}>
      <p className="display-sm text-ink">{title}</p>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{body}</p>
      {children}
      {actionLabel && actionHref ? (
        <div className="mt-5">
          <ButtonLink href={actionHref}>{actionLabel}</ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
