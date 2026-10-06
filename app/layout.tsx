import type { Metadata } from "next";
import { plusJakartaSans, zalandoSans } from "./fonts";
import "./globals.css";

/**
 * Minimal metadata for the foundation layout. Title, description and
 * OpenGraph copy are pending validated content from `content-seo` and
 * `docs/seo-brief.md` (not yet written) — see final report.
 */
export const metadata: Metadata = {
  title: "Softn.io",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${plusJakartaSans.variable} ${zalandoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
