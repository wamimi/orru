"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lockup } from "@/components/brand/Lockup";
import { WalletControl } from "@/components/app/WalletControl";

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="app-topbar">
      <nav className="app-topbar__inner" aria-label="Application navigation">
        <Link href="/app" aria-label="Orru workspace" className="app-topbar__brand">
          <Lockup height={22} />
        </Link>

        <div className="app-topbar__links">
          <Link
            href="/app"
            className={pathname === "/app" ? "is-active" : ""}
          >
            Overview
          </Link>
          <Link
            href="/review"
            className={
              ["/review", "/profile", "/credential", "/consent"].some((route) =>
                pathname.startsWith(route),
              )
                ? "is-active"
                : ""
            }
          >
            Statement
          </Link>
          <Link href="/check">Public checker</Link>
        </div>

        <WalletControl />
      </nav>
    </header>
  );
}
