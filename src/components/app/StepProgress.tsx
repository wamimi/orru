import Link from "next/link";
import { appSteps } from "@/lib/app";

export function StepProgress({ currentIndex }: { currentIndex: number }) {
  const safeIndex = Math.max(currentIndex, 0);
  const current = appSteps[safeIndex];
  const progress = ((safeIndex + 1) / appSteps.length) * 100;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-end gap-3 md:hidden">
        <p className="meta text-ink">{current.label}</p>
        <p className="meta text-ink-faint">{current.number} / 05</p>
      </div>

      <ol className="hidden items-center justify-end gap-x-5 md:flex">
        {appSteps.map((step, stepIndex) => {
          const done = stepIndex < safeIndex;
          const active = stepIndex === safeIndex;
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className={`meta whitespace-nowrap transition-tone ${
                  active
                    ? "text-brand"
                    : done
                      ? "text-ink-soft hover:text-ink"
                      : "text-ink-faint hover:text-ink-soft"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {step.number}
                <span className="ml-1.5">{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div
        className="mt-3 h-px bg-rule"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={appSteps.length}
        aria-valuenow={safeIndex + 1}
        aria-label="Flow progress"
      >
        <div
          className="h-px bg-brand transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
