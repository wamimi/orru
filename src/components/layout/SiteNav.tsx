"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { List, X } from "@phosphor-icons/react";
import { Lockup } from "@/components/brand/Lockup";
import { LandingButton } from "@/components/marketing/LandingButton";
import { navLinks, primaryCta } from "@/lib/nav";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`mkt-nav ${scrolled ? "is-scrolled" : ""} ${open ? "is-open" : ""}`}
    >
      <nav className="mkt-nav__inner" aria-label="Main navigation">
        <ul className="mkt-nav__links">
          {navLinks.slice(0, 3).map((link) => (
            <li key={link.label}>
              <Link href={link.href} className="mkt-nav__link">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/preview"
          aria-label="Orru home"
          className="mkt-nav__brand"
          onClick={() => setOpen(false)}
        >
          <Lockup height={26} />
        </Link>

        <div className="mkt-nav__action">
          <LandingButton href={primaryCta.href} arrow>
            {primaryCta.label}
          </LandingButton>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="mkt-nav__menu"
          >
            {open ? <X size={22} /> : <List size={22} />}
          </button>
        </div>
      </nav>

      <div
        id="mobile-nav"
        className={`mkt-nav__mobile ${open ? "is-open" : ""}`}
        aria-hidden={!open}
      >
        <div>
          <ul>
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link href={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/check" onClick={() => setOpen(false)}>
                Check a statement
              </Link>
            </li>
            <li>
              <Link href={primaryCta.href} onClick={() => setOpen(false)}>
                {primaryCta.label}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
