"use client";

import { useEffect } from "react";

/**
 * Registers the Ghadi service worker once the page has loaded.
 * Rendered in the root layout so it runs on every page.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Wait until the page is fully interactive before registering, so the
    // service worker install doesn't compete with the main-thread work.
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Silently ignore — the app works fine without the service worker.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
