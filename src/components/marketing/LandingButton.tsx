import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

export function LandingButton({
  href,
  children,
  icon,
  tone = "light",
  arrow = false,
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  tone?: "light" | "dark" | "text";
  arrow?: boolean;
}) {
  return (
    <Link href={href} className={`mkt-button mkt-button--${tone}`}>
      {icon}
      <span>{children}</span>
      {arrow ? <ArrowUpRight size={16} aria-hidden="true" /> : null}
    </Link>
  );
}
