"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowSquareOut,
  CheckCircle,
  Gauge,
  List,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import { Lockup } from "@/components/brand/Lockup";
import { useFlowSession } from "@/components/app/useFlowSession";
import { appSteps } from "@/lib/app";
import { truncateAddress } from "@/lib/app";

export function AppNav() {
  const pathname = usePathname();
  const { session } = useFlowSession();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/app", label: "Overview", icon: Gauge, number: null },
    ...appSteps.map((step) => ({
      href: step.href,
      label: step.label,
      icon: CheckCircle,
      number: step.number,
    })),
  ];

  const navLinks = links.map((item) => {
    const active =
      item.href === "/app"
        ? pathname === "/app"
        : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`app-sidebar__link ${active ? "is-active" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <Icon size={17} weight={active ? "fill" : "regular"} />
        <span>{item.label}</span>
        {item.number ? <span className="app-sidebar__step">{item.number}</span> : null}
      </Link>
    );
  });

  return (
    <>
      <aside className="app-sidebar">
        <Link
          href="/app"
          aria-label="Orru home"
          className="app-sidebar__brand"
        >
          <Lockup height={23} />
        </Link>

        <p className="app-sidebar__label">Workspace</p>
        <nav className="app-sidebar__nav" aria-label="Application">
          {navLinks}
        </nav>

        <div className="app-sidebar__footer">
          {session.address ? (
            <div className="app-wallet">
              <span className="app-wallet__dot" aria-hidden="true" />
              <span>{truncateAddress(session.address)}</span>
            </div>
          ) : null}
          <Link href="/check" className="app-sidebar__link">
            <MagnifyingGlass size={17} />
            <span>Public checker</span>
          </Link>
          <Link href="/preview" className="app-sidebar__link">
            <ArrowSquareOut size={17} />
            <span>Back to website</span>
          </Link>
        </div>
      </aside>

      <header className="app-mobile-nav">
        <div className="app-mobile-nav__bar">
          <Link href="/app" aria-label="Orru dashboard">
            <Lockup height={20} />
          </Link>
          <button
            type="button"
            className="app-mobile-nav__menu"
            aria-expanded={open}
            aria-controls="app-mobile-menu"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} /> : <List size={20} />}
          </button>
        </div>
        <div
          id="app-mobile-menu"
          className={`app-mobile-nav__panel ${open ? "is-open" : ""}`}
          aria-hidden={!open}
        >
          <div>
            <nav className="app-mobile-nav__links" aria-label="Application">
              {navLinks}
              <Link href="/check" className="app-sidebar__link" onClick={() => setOpen(false)}>
                <MagnifyingGlass size={17} />
                <span>Public checker</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
