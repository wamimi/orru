import type { Metadata } from "next";
import { Archivo, DM_Sans, Instrument_Sans, JetBrains_Mono, Syne } from "next/font/google";
import { IconProvider } from "@/components/IconProvider";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

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

export const metadata: Metadata = {
  metadataBase: new URL("https://orru.xyz"),
  title: {
    default: "orru — prove crypto income. borrow against it.",
    template: "%s — Orru",
  },
  description:
    "Orru helps people paid in stablecoins prove recurring income privately and access credit against it — without a bank statement.",
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
      "Private proof of crypto income, and credit against it. Built for remote workers paid in stablecoins.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} ${syne.variable} ${dmSans.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <IconProvider>{children}</IconProvider>
      </body>
    </html>
  );
}
