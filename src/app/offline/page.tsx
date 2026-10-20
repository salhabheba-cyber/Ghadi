import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "You're offline · Ghadi",
};

/**
 * Shown by the service worker when a navigation request fails and no cached
 * version of the requested page exists.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      {/* Icon: a wifi-with-slash shape rendered in the brand purple */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-16 w-16 text-brand-400"
        aria-hidden
      >
        <path d="M1 1l22 22" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <circle cx="12" cy="20" r="1" fill="currentColor" />
      </svg>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">You&rsquo;re offline</h1>
        <p className="max-w-sm text-muted-foreground">
          No internet connection right now. Any study material you&rsquo;ve already opened is still
          available — your data lives in your browser.
        </p>
      </div>

      <Link
        href="/"
        className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        Try again
      </Link>
    </div>
  );
}
