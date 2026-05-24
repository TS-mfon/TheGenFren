import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";

import { ProductTour } from "../components/ProductTour";

export const metadata: Metadata = {
  title: "GenFren",
  description: "A persistent AI companion that remembers context, follows your goals, and returns with useful briefings."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ProductTour />
      </body>
    </html>
  );
}
