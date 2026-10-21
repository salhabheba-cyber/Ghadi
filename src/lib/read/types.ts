/** Shapes returned by /api/app that the pages rely on. Kept in one place so a server change shows up as a type error. */
import type { Lang } from "./strings";

export interface BookCardData {
  slug: string;
  title: string;
  author: string;
  language: Lang;
  cover_path: string | null;
  age_min: number;
  age_max: number;
  est_minutes: number | null;
  reading_level?: string | null;
}
export interface BookFull extends BookCardData {
  id: string;
  synopsis: string;
  genres: string[];
  subjects: string[];
  source: string;
  source_url: string;
  license: string;
  license_url: string;
  attribution: string;
  layout: "pages" | "scroll";
  content_path: string;
  status: string;
}
export interface ProgressBook extends BookCardData {
  furthest_percent: number;
  percent: number;
  active_seconds: number;
  completed: boolean;
  completed_at: string | null;
  last_read_at: string;
}
export interface ProgressData {
  opened: number;
  reading: ProgressBook[];
  completed: ProgressBook[];
  all: ProgressBook[];
  totalSeconds: number;
  languages: string[];
  perDay: { day: string; seconds: number }[];
  streak: number;
  achievements: { code: string; earnedAt: string }[];
}
export interface FacetData {
  genres: { value: string; count: number }[];
  levels: { value: string; count: number }[];
  languages: { value: string; count: number }[];
}
export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  actor_name: string | null;
  actor_kind: string;
  school_name?: string | null;
  detail: Record<string, unknown> | null;
}
export interface SchoolStatsData {
  students: { active: number; pending: number; disabled: number; archived: number };
  booksCompleted: number;
  booksCompletedThisMonth: number;
  activeReadersLast30Days: number;
  averageBooksPerStudent: number;
  byLanguage: { language: string; n: number }[];
  topBooks: { title: string; language: string; n: number }[];
  perMonth: { month: string; n: number }[];
}
export interface PlatformStatsData {
  schools: number;
  students: { active: number; pending: number; disabled: number; archived: number };
  booksCompleted: number;
  activeReadersLast7Days: number;
  staff: number;
  catalog: { language: string; n: number }[];
  perSchool: {
    id: string;
    name: string;
    join_code: string;
    archived_at: string | null;
    students: number;
    pending: number;
    books_completed: number;
    admins: number;
  }[];
}
export interface StudentReadingRow {
  slug: string;
  title: string;
  language: string;
  furthest_percent: number;
  active_seconds: number;
  completed_at: string | null;
  method: string | null;
  score: number | null;
  voided_at: string | null;
  void_reason: string | null;
}
export type AdminBookRow = BookFull;
