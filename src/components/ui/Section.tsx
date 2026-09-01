import type { ReactNode } from "react";

type SectionProps = {
  children: ReactNode;
  id?: string;
  tone?: "canvas" | "raised" | "night";
  className?: string;
  divide?: boolean;
};

const tones = {
  canvas: "bg-canvas",
  raised: "bg-canvas-raised",
  night: "on-night",
} as const;

export function Section({
  children,
  id,
  tone = "canvas",
  className,
  divide = true,
}: SectionProps) {
  return (
    <section
      id={id}
      className={`${tones[tone]} ${divide ? "border-t border-rule" : ""} ${className ?? ""}`}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 md:px-10 md:py-28">
        {children}
      </div>
    </section>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow flex items-center gap-2 text-ink-faint">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
      {children}
    </p>
  );
}
