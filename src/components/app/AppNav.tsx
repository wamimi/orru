"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lockup } from "@/components/brand/Lockup";
import { StepProgress } from "@/components/app/StepProgress";
import { appSteps } from "@/lib/app";

export function AppNav() {
  const pathname = usePathname();
  const index = appSteps.findIndex((step) => pathname.startsWith(step.href));

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-canvas/90 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-5xl items-start gap-6 px-6 py-4 md:px-10">
        <Link
          href="/"
          aria-label="Orru home"
          className="mt-0.5 shrink-0 text-brand"
        >
          <Lockup height={20} />
        </Link>
        <StepProgress currentIndex={index} />
      </nav>
    </header>
  );
}
