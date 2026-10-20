import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ghadi — Learn Smarter. Remember More. Stay Free.",
    short_name: "Ghadi",
    description:
      "Free, open-source, local-first study platform. Turn your documents into notes, quizzes and flashcards. Your data stays in your browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8ff",
    theme_color: "#7c3aed",
    orientation: "portrait-primary",
    categories: ["education", "productivity"],
    lang: "en",
    icons: [
      { src: "/icons/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { src: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
