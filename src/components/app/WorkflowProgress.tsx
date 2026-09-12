"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const workflow = [
  { href: "/review", label: "Review" },
  { href: "/profile", label: "Profile" },
  { href: "/credential", label: "Credential" },
  { href: "/consent", label: "Share" },
] as const;

export function WorkflowProgress() {
  const pathname = usePathname();
  const current = workflow.findIndex((step) => pathname.startsWith(step.href));
  if (current < 0) return null;

  return (
    <nav className="workflow-progress" aria-label="Statement workflow">
      <ol>
        {workflow.map((step, index) => {
          const active = index === current;
          const done = index < current;
          return (
            <li
              key={step.href}
              className={`${active ? "is-active" : ""} ${done ? "is-done" : ""}`}
            >
              <Link href={step.href} aria-current={active ? "step" : undefined}>
                <span className="workflow-progress__number">{index + 1}</span>
                <span className="workflow-progress__label">{step.label}</span>
              </Link>
              {index < workflow.length - 1 ? (
                <span className="workflow-progress__line" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
