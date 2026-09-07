export type NavLink = {
  label: string;
  href: string;
  placeholder?: boolean;
};

/** Single source of truth for nav and footer. Swap the Docs href here only. */
export const navLinks: NavLink[] = [
  { label: "For individuals", href: "#individuals" },
  { label: "For lenders", href: "#lenders" },
  { label: "Docs", href: "#", placeholder: true },
];

/** Repointed to the app flow in Phase 2. */
export const primaryCta = { label: "Get started", href: "/connect" };
