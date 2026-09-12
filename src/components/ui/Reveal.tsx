import type { ElementType, ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  /** Stagger index within a group. Offsets the scroll range, not a timer. */
  order?: number;
  className?: string;
  id?: string;
};

/**
 * Scroll-linked fade-up driven entirely by CSS `animation-timeline: view()`.
 * No observers and no client JS, so content can never be left stuck at
 * opacity 0; browsers without support simply render it plainly.
 */
export function Reveal({
  children,
  as: Tag = "div",
  order = 0,
  className,
  id,
}: RevealProps) {
  return (
    <Tag
      id={id}
      className={`reveal ${className ?? ""}`}
      style={order ? ({ "--reveal-order": order } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

/** Above-the-fold entrance. Plays once on load rather than on scroll. */
export function Intro({
  children,
  as: Tag = "div",
  delay = 0,
  className,
  id,
}: Omit<RevealProps, "order"> & { delay?: number }) {
  return (
    <Tag
      id={id}
      className={`intro ${className ?? ""}`}
      style={delay ? ({ "--intro-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
