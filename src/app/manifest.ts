import type { MetadataRoute } from "next";
import { ICONS } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ghadi — Learn Smarter. Remember More. Stay Free.",
    short_name: "Ghadi",
    description:
      "Free, open-source, local-first study platform. Turn your documents into notes, quizzes and flashcards. Your data stays in your browser.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf8ff",
    theme_color: "#7c3aed",
    orientation: "portrait-primary",
    categories: ["education", "productivity"],
    lang: "en",
    icons: [
      { src: ICONS.favicon16, sizes: "16x16", type: "image/png", purpose: "any" },
      { src: ICONS.favicon32, sizes: "32x32", type: "image/png", purpose: "any" },
      { src: ICONS.any192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ICONS.any512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: ICONS.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
