"use client";

import { IconContext } from "@phosphor-icons/react";
import type { ReactNode } from "react";

const iconDefaults = {
  weight: "bold" as const,
  size: 20,
  color: "currentColor",
};

export function IconProvider({ children }: { children: ReactNode }) {
  return <IconContext.Provider value={iconDefaults}>{children}</IconContext.Provider>;
}
