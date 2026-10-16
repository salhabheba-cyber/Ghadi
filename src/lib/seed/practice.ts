/** Original short texts written for GHADI (not from any book). FR/AR stay "in_review" until a native speaker approves them. */
export interface SeedText { slug: string; kind: "dictation" | "reading"; language: "en" | "fr" | "ar"; title: string; body: string; status: "approved" | "in_review" }
export const SEED_TEXTS: SeedText[] = [
  { slug: "dictation-cat-mat", kind: "dictation", language: "en", title: "The cat", body: "The cat sat on a mat.", status: "approved" },
  { slug: "dictation-red-bird", kind: "dictation", language: "en", title: "The red bird", body: "A red bird can fly.", status: "approved" },
  { slug: "dictation-play", kind: "dictation", language: "en", title: "Playing", body: "I like to play.", status: "approved" },
  { slug: "dictation-chat-fr", kind: "dictation", language: "fr", title: "Le chat", body: "Le chat dort.", status: "in_review" },
  { slug: "dictation-shams-ar", kind: "dictation", language: "ar", title: "الشمس", body: "هذه شمس جميلة.", status: "in_review" },
  { slug: "reading-sun-bus", kind: "reading", language: "en", title: "The sun and the bus", body: "The sun is up. I see a big red bus.", status: "approved" },
  { slug: "reading-my-dog", kind: "reading", language: "en", title: "My dog", body: "I have a dog. The dog can run and jump.", status: "approved" },
  { slug: "reading-chat-fr", kind: "reading", language: "fr", title: "Je vois un chat", body: "Je vois un chat. Il est petit.", status: "in_review" },
  { slug: "reading-shams-ar", kind: "reading", language: "ar", title: "أحب الشمس", body: "أنا أحب الشمس.", status: "in_review" },
];
