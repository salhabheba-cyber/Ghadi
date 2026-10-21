/**
 * Shared model for quiz exports (PDF, Word, Excel).
 *
 * Answer secrecy is enforced by construction: `buildExportDoc` is the only place that reads
 * `correct` and `explanation`, and it produces `key: null` unless an answer key was requested.
 * The format builders never see an answer for a quiz-only export, so nothing can leak into the
 * file, its comments, hidden sheets or metadata.
 */

export type ExportFormat = "pdf" | "docx" | "xlsx";
export type ExportContent = "quiz" | "quiz-and-key" | "key";
export type ExportLang = "en" | "fr" | "ar";

export interface ExportQuestion {
  type: "mcq" | "tf" | "short" | "fill";
  prompt: string;
  options?: string[];
  correct: string[];
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard";
}

export interface ExportRequest {
  title: string;
  subtitle?: string;
  questions: ExportQuestion[];
  content: ExportContent;
  includeExplanations: boolean;
  /** Print Name / Date / Score fields. */
  studentFields: boolean;
  studentName?: string;
  date?: string;
  language: ExportLang;
  generatedAt: string;
}

export interface PublicItem {
  number: number;
  type: ExportQuestion["type"];
  prompt: string;
  options: string[];
  difficulty: "easy" | "medium" | "hard";
}

export interface KeyItem {
  number: number;
  prompt: string;
  /** Display form of the answer, e.g. "B. Chlorophyll" for choice questions. */
  answer: string;
  explanation?: string;
}

export interface ExportDoc {
  title: string;
  subtitle?: string;
  language: ExportLang;
  generatedAt: string;
  studentFields: boolean;
  studentName?: string;
  date?: string;
  /** The question sheet. Null for an answer-key-only export. */
  items: PublicItem[] | null;
  /** The answer key. Null unless the user asked for one. */
  key: KeyItem[] | null;
  totalQuestions: number;
}

export class ExportError extends Error {
  constructor(
    readonly code: "unsupported-script" | "empty" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
export const letter = (i: number): string => LETTERS[i] ?? String(i + 1);

export interface Labels {
  name: string;
  date: string;
  score: string;
  instructions: string;
  answerKey: string;
  question: string;
  questions: string;
  type: string;
  difficulty: string;
  answer: string;
  explanation: string;
  yourAnswer: string;
  page: string;
  of: string;
  generatedWith: string;
  types: Record<ExportQuestion["type"], string>;
  levels: Record<"easy" | "medium" | "hard", string>;
  trueFalse: [string, string];
  writeBelow: string;
}

export const LABELS: Record<ExportLang, Labels> = {
  en: {
    name: "Name",
    date: "Date",
    score: "Score",
    instructions: "Choose the best answer for each question. Write short answers on the lines.",
    answerKey: "Answer Key",
    question: "Question",
    questions: "Questions",
    type: "Type",
    difficulty: "Difficulty",
    answer: "Answer",
    explanation: "Explanation",
    yourAnswer: "Your answer",
    page: "Page",
    of: "of",
    generatedWith: "Generated with Ghadi",
    types: {
      mcq: "Multiple choice",
      tf: "True / False",
      short: "Short answer",
      fill: "Fill in the blank",
    },
    levels: { easy: "Easy", medium: "Medium", hard: "Hard" },
    trueFalse: ["True", "False"],
    writeBelow: "Write your answer below",
  },
  fr: {
    name: "Nom",
    date: "Date",
    score: "Note",
    instructions:
      "Choisissez la meilleure réponse à chaque question. Écrivez les réponses courtes sur les lignes.",
    answerKey: "Corrigé",
    question: "Question",
    questions: "Questions",
    type: "Type",
    difficulty: "Difficulté",
    answer: "Réponse",
    explanation: "Explication",
    yourAnswer: "Votre réponse",
    page: "Page",
    of: "sur",
    generatedWith: "Généré avec Ghadi",
    types: {
      mcq: "Choix multiple",
      tf: "Vrai / Faux",
      short: "Réponse courte",
      fill: "Texte à trous",
    },
    levels: { easy: "Facile", medium: "Moyen", hard: "Difficile" },
    trueFalse: ["Vrai", "Faux"],
    writeBelow: "Écrivez votre réponse ci-dessous",
  },
  ar: {
    name: "الاسم",
    date: "التاريخ",
    score: "الدرجة",
    instructions: "اختر أفضل إجابة لكل سؤال، واكتب الإجابات القصيرة على الأسطر.",
    answerKey: "مفتاح الإجابات",
    question: "السؤال",
    questions: "الأسئلة",
    type: "النوع",
    difficulty: "الصعوبة",
    answer: "الإجابة",
    explanation: "الشرح",
    yourAnswer: "إجابتك",
    page: "صفحة",
    of: "من",
    generatedWith: "أُنشئ بواسطة غدي",
    types: { mcq: "اختيار من متعدد", tf: "صح / خطأ", short: "إجابة قصيرة", fill: "أكمل الفراغ" },
    levels: { easy: "سهل", medium: "متوسط", hard: "صعب" },
    trueFalse: ["صح", "خطأ"],
    writeBelow: "اكتب إجابتك أدناه",
  },
};

/** Maps a saved quiz language ("French", "Modern Standard Arabic", "same as source"...) to a label language. */
export function languageFor(quizLanguage: string | undefined, sample: string): ExportLang {
  const l = (quizLanguage ?? "").toLowerCase();
  if (l.includes("arab")) return "ar";
  if (l.includes("fran") || l.includes("french")) return "fr";
  if (l.includes("english")) return "en";
  return /[؀-ۿ]/.test(sample) ? "ar" : "en";
}

function answerDisplay(q: ExportQuestion): string {
  const first = q.correct[0] ?? "";
  if ((q.type === "mcq" || q.type === "tf") && q.options) {
    const i = q.options.findIndex((o) => o === first);
    if (i >= 0) return `${letter(i)}. ${first}`;
  }
  return q.correct.join(" / ");
}

/** The ONLY function that reads correct answers and explanations. */
export function buildExportDoc(req: ExportRequest): ExportDoc {
  if (req.questions.length === 0) {
    throw new ExportError("empty", "There are no questions to export.");
  }
  const wantQuestions = req.content !== "key";
  const wantKey = req.content !== "quiz";
  return {
    title: req.title,
    subtitle: req.subtitle,
    language: req.language,
    generatedAt: req.generatedAt,
    studentFields: req.studentFields && wantQuestions,
    studentName: req.studentName,
    date: req.date,
    totalQuestions: req.questions.length,
    items: wantQuestions
      ? req.questions.map((q, i) => ({
          number: i + 1,
          type: q.type,
          prompt: q.prompt,
          options: q.options ? [...q.options] : [],
          difficulty: q.difficulty ?? "medium",
        }))
      : null,
    key: wantKey
      ? req.questions.map((q, i) => ({
          number: i + 1,
          prompt: q.prompt,
          answer: answerDisplay(q),
          explanation: req.includeExplanations && q.explanation ? q.explanation : undefined,
        }))
      : null,
  };
}
