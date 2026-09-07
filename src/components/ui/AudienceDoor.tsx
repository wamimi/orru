import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export function AudienceDoor({
  href,
  eyebrow,
  title,
  body,
}: {
  href: string;
  eyebrow?: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col justify-between gap-10 border-t-2 border-rule-strong pt-6 transition-tone duration-200 hover:border-brand md:pt-8"
    >
      <div>
        {eyebrow ? <p className="eyebrow text-ink-faint">{eyebrow}</p> : null}
        <h3
          className={`display-lg max-w-sm text-ink transition-tone duration-200 group-hover:text-brand ${eyebrow ? "mt-4" : ""}`}
        >
          {title}
        </h3>
      </div>
      <div className="flex items-end justify-between gap-6">
        <p className="max-w-sm text-[0.9375rem] leading-relaxed text-ink-soft">
          {body}
        </p>
        <ArrowUpRight
          size={24}
          className="shrink-0 text-ink-faint transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand"
        />
      </div>
    </Link>
  );
}
