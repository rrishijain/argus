import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Display carries the numerals and the wordmark only. Archivo's wdth axis is
// pushed wide (see --display-wdth in globals.css) — engineered and broad, the
// opposite of a condensed athletic face. latin-ext is required for ₹ (U+20B9).
const display = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-display",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ARGUS — Autonomous Reporting & Growth Unified System",
  description: "Marketing operating system HUD — paid media, search, and publishing over a plain-file vault",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
