import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Syne } from "next/font/google";
import { IconProvider } from "@/components/IconProvider";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://orru.xyz"),
  title: {
    default: "orru — use your on-chain income as a credential",
    template: "%s — Orru",
  },
  description:
    "Orru turns stablecoin payments into a private income credential. Share a band with a fintech, a neobank, or anywhere proof of income is required.",
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "orru",
    title: "orru",
    description:
      "Use your on-chain income as a credential. Private income bands for fintechs, neobanks, and anyone who needs to show they earn.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <IconProvider>{children}</IconProvider>
      </body>
    </html>
  );
}
