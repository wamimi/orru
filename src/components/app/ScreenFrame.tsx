import type { ReactNode } from "react";

export function ScreenFrame({
  kicker,
  title,
  lede,
  aside,
  children,
}: {
  kicker: string;
  title: string;
  lede?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <div
        className={
          aside
            ? "grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:gap-x-16"
            : undefined
        }
      >
        <header>
          <p className="eyebrow text-brand">{kicker}</p>
          <h1 className="display-lg mt-4 max-w-xl text-ink">{title}</h1>
          {lede ? (
            <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-ink-soft md:text-base">
              {lede}
            </p>
          ) : null}
        </header>
        {aside ? (
          <aside className="lg:sticky lg:top-24 lg:row-span-2">{aside}</aside>
        ) : null}
        <div className={aside ? "lg:col-start-1" : "mt-10"}>{children}</div>
      </div>
    </div>
  );
}

export function ScreenSkeleton({
  kicker,
  title,
}: {
  kicker: string;
  title: string;
}) {
  return (
    <ScreenFrame kicker={kicker} title={title}>
      <div className="space-y-8" aria-hidden="true">
        <div className="h-px bg-rule-strong" />
        <div className="h-20 bg-canvas-raised" />
        <div className="h-px bg-rule-strong" />
        <div className="h-20 bg-canvas-raised" />
      </div>
    </ScreenFrame>
  );
}
