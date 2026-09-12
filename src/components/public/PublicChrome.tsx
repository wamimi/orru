import Link from "next/link";
import type { ReactNode } from "react";
import { Lockup } from "@/components/brand/Lockup";

export function PublicChrome({ children }: { children: ReactNode }) {
  return (
    <div className="product-shell public-shell">
      <header className="public-nav">
        <nav className="public-nav__inner" aria-label="Public statement navigation">
          <Link href="/" aria-label="Orru home" className="public-nav__brand">
            <Lockup height={22} />
          </Link>
          <span className="public-nav__label">Public verification</span>
          <div className="public-nav__actions">
            <Link href="/check" className="public-nav__link">
              Check a statement
            </Link>
            <Link href="/connect" className="public-nav__link">
              Launch app
            </Link>
          </div>
        </nav>
      </header>
      <main className="public-main">{children}</main>
    </div>
  );
}
