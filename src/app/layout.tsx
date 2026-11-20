import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Inter, Lexend } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

// The home pages redesign (BLOOM_HOME_REDESIGN.md §1): headings, the wordmark and large numerals.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

// Everything else on the redesigned pages and the shell.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Bloom", template: "%s · Bloom" },
  description: "Standards-aligned assessments with a corrections-and-retake learning cycle.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lexend.variable} ${bricolage.variable} ${hanken.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
