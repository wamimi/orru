import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "solid" | "outline" | "quiet";

const variants: Record<Variant, string> = {
  solid: "bg-brand text-canvas hover:bg-brand-hover",
  outline: "border border-rule-strong text-ink hover:border-ink hover:bg-paper",
  quiet: "text-ink-soft hover:text-ink",
};

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 text-[0.9375rem] font-medium transition-tone duration-150 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45";

type ButtonAsLink = {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">;

export function ButtonLink({
  href,
  variant = "solid",
  className,
  children,
  ...rest
}: ButtonAsLink) {
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function Button({
  variant = "solid",
  className,
  children,
  ...rest
}: { variant?: Variant } & ComponentProps<"button">) {
  return (
    <button
      className={`${base} ${variants[variant]} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
