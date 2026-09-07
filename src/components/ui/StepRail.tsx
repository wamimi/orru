import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

export type Step = {
  title: string;
  body: string;
  aside?: ReactNode;
};

export function StepRail({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-14 border-t border-rule">
      {steps.map((step, index) => (
        <Reveal
          key={step.title}
          as="li"
          order={index}
          className="grid gap-4 border-b border-rule py-8 md:grid-cols-[5rem_minmax(0,1fr)_minmax(0,18rem)] md:gap-10 md:py-10"
        >
          <span className="meta pt-1 text-brand">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <h3 className="display-sm text-ink">{step.title}</h3>
            <p className="mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-ink-soft">
              {step.body}
            </p>
          </div>
          <div className="md:pt-1">{step.aside}</div>
        </Reveal>
      ))}
    </ol>
  );
}
