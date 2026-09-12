import type { ReactNode } from "react";

export function ActionStep({
  number,
  title,
  body,
  meta,
  action,
  complete = false,
}: {
  number: string;
  title: string;
  body: string;
  meta?: ReactNode;
  action: ReactNode;
  complete?: boolean;
}) {
  return (
    <div
      className={`product-action-step flex flex-col gap-6 border-t-2 pt-6 transition-tone md:flex-row md:items-end md:justify-between md:gap-10 md:pt-8 ${
        complete ? "border-brand" : "border-rule-strong"
      }`}
    >
      <div className="max-w-md">
        <p className="meta text-brand">{number}</p>
        <h3 className="display-md mt-3 text-ink">{title}</h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
          {body}
        </p>
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
