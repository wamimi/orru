import type { ReactNode } from "react";
import { Check, CircleNotch, Minus } from "@phosphor-icons/react";
import type { StageStatus } from "@/lib/review-machine";

function StageMark({ status }: { status: StageStatus }) {
  if (status === "running") {
    return (
      <CircleNotch size={18} className="animate-spin text-brand" aria-hidden />
    );
  }
  if (status === "done") {
    return <Check size={18} className="text-brand" aria-hidden />;
  }
  if (status === "failed" || status === "empty") {
    return <Minus size={18} className="text-ink-faint" aria-hidden />;
  }
  return (
    <span className="inline-block h-2 w-2 rounded-full bg-rule-strong" aria-hidden />
  );
}

export type StageItem = {
  id: string;
  title: string;
  body: string;
  status: StageStatus;
};

export function StageList({ stages }: { stages: StageItem[] }) {
  return (
    <ol>
      {stages.map((stage, index) => {
        const last = index === stages.length - 1;
        return (
          <li key={stage.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-4">
            <div className="flex h-full flex-col items-center">
              <span className="flex h-7 w-7 items-center justify-center">
                <StageMark status={stage.status} />
              </span>
              {last ? null : <span className="mt-1 w-px flex-1 bg-rule" />}
            </div>
            <div className={last ? "pb-0" : "pb-8"}>
              <p className="display-sm text-ink">{stage.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {stage.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function StageAside({ children }: { children: ReactNode }) {
  return (
    <div className="border-t-2 border-rule-strong pt-6 md:pt-8">
      {children}
    </div>
  );
}
