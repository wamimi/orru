"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lockup } from "@/components/brand/Lockup";
import { appSteps } from "@/lib/app";

export function AppNav() {
  const pathname = usePathname();
  const index = appSteps.findIndex((step) => pathname.startsWith(step.href));
  const current = appSteps[Math.max(index, 0)];

  return (
    <header className="border-b border-rule bg-canvas">
      <nav className="mx-auto flex w-full max-w-3xl items-center gap-4 px-6 py-4">
        <Link href="/" aria-label="Orru home" className="text-brand">
          <Lockup height={18} />
        </Link>
        <p className="meta ml-auto text-ink-faint md:hidden">
          {current.number} of 05
        </p>
        <ol className="ml-auto hidden items-center gap-5 md:flex">
          {appSteps.map((step, stepIndex) => {
            const done = stepIndex < index;
            const active = index === stepIndex;
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className={`meta transition-tone ${
                    active
                      ? "text-brand"
                      : done
                        ? "text-ink-soft hover:text-ink"
                        : "text-ink-faint hover:text-ink-soft"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  {step.number} {step.label}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}
