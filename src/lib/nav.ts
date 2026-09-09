export type NavLink = {
  label: string;
  href: string;
  placeholder?: boolean;
};

/** Marketing navigation. Every anchor exists on /preview. */
export const navLinks: NavLink[] = [
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "How it works", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
];

export const primaryCta = { label: "Launch app", href: "/connect" };
