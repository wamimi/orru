import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

export function LandingButton({
  href,
  children,
  tone = "light",
  arrow = false,
}: {
  href: string;
  children: ReactNode;
  tone?: "light" | "dark" | "text";
  arrow?: boolean;
}) {
  return (
    <Link href={href} className={`mkt-button mkt-button--${tone}`}>
      <span>{children}</span>
      {arrow ? <ArrowUpRight size={16} aria-hidden="true" /> : null}
    </Link>
  );
}
