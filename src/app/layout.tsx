import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { LanguageSync } from "@/components/language-sync";
import { ICONS } from "@/lib/brand";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ghadi — Learn Smarter. Remember More. Stay Free.", template: "%s · Ghadi" },
  description:
    "Ghadi is a free, open-source, local-first study platform: turn your documents into notes, quizzes and flashcards. Your data stays in your browser.",
  applicationName: "Ghadi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ghadi",
  },
  icons: {
    icon: [
      { url: ICONS.favicon16, sizes: "16x16", type: "image/png" },
      { url: ICONS.favicon32, sizes: "32x32", type: "image/png" },
      { url: ICONS.any192, sizes: "192x192", type: "image/png" },
      { url: ICONS.any512, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: ICONS.apple180, sizes: "180x180", type: "image/png" }],
  },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0a1e" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the per-request header opts every page into dynamic rendering, which is what lets Next.js
  // stamp the CSP nonce (set in src/proxy.ts) on its scripts.
  await headers();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Same-origin file (not inline) so the CSP needs no 'unsafe-inline'. Runs before paint. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        {children}
        <LanguageSync />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
