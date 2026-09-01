import type { ReactNode } from "react";

export function ScreenFrame({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <p className="eyebrow text-brand">{kicker}</p>
      <h1 className="display-lg mt-4 max-w-xl text-ink">{title}</h1>
      {lede ? (
        <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-ink-soft">
          {lede}
        </p>
      ) : null}
      <div className="mt-10">{children}</div>
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
      <div className="space-y-3" aria-hidden="true">
        <div className="h-14 rounded-card bg-canvas-raised" />
        <div className="h-14 rounded-card bg-canvas-raised" />
        <div className="h-14 rounded-card bg-canvas-raised" />
      </div>
    </ScreenFrame>
  );
}
