import asp from "./manifest-asp.json";
import se from "./manifest-se.json";
import pgFr from "./manifest-gutenberg-fr.json";
import synopses from "./synopses.json";

export interface CatalogEntry {
  slug: string;
  source: "globalstorybooks" | "gutenberg" | "standardebooks";
  sourceId: string;
  language: "ar" | "fr" | "en";
  title: string;
  author: string;
  synopsis: string;
  ageMin: number;
  ageMax: number;
  readingLevel: string | null;
  levelBasis: string;
  genres: string[];
  subjects: string[];
  pageCount: number;
  wordCount: number;
  estMinutes: number;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  coverPath: string | null;
  contentPath: string;
  layout: "pages" | "scroll";
  verifiedOn: string;
}

type Raw = Omit<CatalogEntry, "synopsis"> & { synopsis?: string; excerpt?: string };

const SYN = synopses as Record<string, string>;

function finish(b: Raw): CatalogEntry {
  const written = SYN[b.slug];
  const synopsis = written ?? (b.excerpt ? `${b.excerpt.trim()}…` : (b.synopsis ?? ""));
  return { ...(b as CatalogEntry), synopsis };
}

/** The license-verified starter library. Every entry's text is stored in Ghadi (public/books/*.json). */
export const CATALOG: CatalogEntry[] = [
  ...(se as unknown as Raw[]),
  ...(pgFr as unknown as Raw[]),
  ...(asp as unknown as Raw[]),
].map(finish);
