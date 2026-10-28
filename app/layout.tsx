import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin", "latin-ext"],
});

export const viewport = { viewportFit: "cover" as const, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#eef2f8" }, { media: "(prefers-color-scheme: dark)", color: "#0b1122" }] };

export const metadata: Metadata = {
  title: "ShiftSync",
  description: "PDF rozpis služeb do .ics",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="cs"
      className={`${atkinson.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
