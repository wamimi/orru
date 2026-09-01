import Link from "next/link";
import { Lockup } from "@/components/brand/Lockup";
import { navLinks } from "@/lib/nav";

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-canvas">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 md:flex-row md:items-start md:justify-between md:px-10">
        <div>
          <span className="text-brand">
            <Lockup height={20} />
          </span>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
            Income verification for people paid onchain, built so no data broker
            sits inside the credit decision.
          </p>
        </div>

        <div className="flex flex-col gap-4 md:items-end">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm text-ink-soft transition-tone duration-150 hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="meta flex items-center gap-2 text-ink-faint">
            <span className="signal-dot inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            Testnet preview
          </p>
        </div>
      </div>
    </footer>
  );
}
