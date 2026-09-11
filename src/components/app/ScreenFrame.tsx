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
    <div className="product-screen">
      <div className={`product-screen__grid ${aside ? "has-aside" : ""}`}>
        <header className="product-screen__header">
          <p className="product-screen__kicker">{kicker}</p>
          <h1 className="product-title">{title}</h1>
          {lede ? (
            <p className="product-screen__lede">
              {lede}
            </p>
          ) : null}
        </header>
        {aside ? (
          <aside className="product-screen__aside">{aside}</aside>
        ) : null}
        <div className="product-screen__content">{children}</div>
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
