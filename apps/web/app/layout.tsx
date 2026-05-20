import "./globals.css";
import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import { ReactNode } from "react";

import { ProductTour } from "../components/ProductTour";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-heading"
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "GenFren",
  description: "A persistent AI companion that remembers context, follows your goals, and returns with useful briefings."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${manrope.variable}`}>
        {children}
        <ProductTour />
      </body>
    </html>
  );
}
