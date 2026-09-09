import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteNav } from "@/components/layout/SiteNav";
import "./marketing.css";

const geist = Geist({
  variable: "--font-mkt-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mkt-mono",
  subsets: ["latin"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-mkt-display",
  subsets: ["latin"],
  display: "swap",
});

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`marketing-shell ${geist.variable} ${geistMono.variable} ${newsreader.variable}`}
    >
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
