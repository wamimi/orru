import Link from "next/link";
import type { ReactNode } from "react";
import { Lockup } from "@/components/brand/Lockup";

export function PublicChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-rule bg-canvas/90 backdrop-blur-md">
        <nav className="mx-auto flex w-full max-w-5xl items-center px-6 py-4 md:px-10">
          <Link href="/" aria-label="Orru home" className="text-brand">
            <Lockup height={20} />
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
