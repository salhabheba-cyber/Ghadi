import type { MetadataRoute } from "next";

// Installable-app manifest. start_url "/" goes through the Accept-Language redirect to /en, /fr or /ar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GHADI",
    short_name: "GHADI",
    description: "Learn today. Grow for tomorrow.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fff4ea",
    theme_color: "#b4492a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
