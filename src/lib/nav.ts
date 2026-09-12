export type NavLink = {
  label: string;
  href: string;
  placeholder?: boolean;
};

/** Marketing navigation. Every anchor exists on /preview. */
export const navLinks: NavLink[] = [
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Use cases", href: "#use-cases" },
  { label: "Docs", href: "https://orru.mintlify.site/" },
];

export const primaryCta = { label: "Launch app", href: "/connect" };
