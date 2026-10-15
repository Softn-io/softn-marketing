import type { Metadata } from "next";
import { plusJakartaSans, zalandoSans } from "./fonts";
import { metadataContent } from "@/locales/fr/metadata";
import { SITE_URL } from "@/lib/site";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const { home } = metadataContent;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: home.title,
  description: home.description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    title: home.openGraph.title,
    description: home.openGraph.description,
    locale: home.openGraph.locale,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${plusJakartaSans.variable} ${zalandoSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
