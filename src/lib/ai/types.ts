import type { Difficulty, Origin, QuestionType } from "@/lib/validation/schemas";

export interface SourceInput {
  title: string;
  text: string;
  /** Set for a topic-based quiz with no source document (model knowledge, not grounded). */
  topic?: string;
}

export interface NoteOptions {
  language: string;
}

export interface QuizOptions {
  count: number;
  difficulty: Difficulty;
  types: QuestionType[];
  /** "same as source" or a language name such as "Arabic". */
  language: string;
}

export interface CardOptions {
  count: number;
  language: string;
}

export interface NoteDraft {
  overview: string;
  summary: string;
  keyConcepts: string[];
  definitions: {
    term: string;
    definition: string;
    sourceExcerpt?: string;
    provenance: "extracted" | "generated";
  }[];
  sections: {
    heading: string;
    body: string;
    sourceExcerpt?: string;
    provenance: "extracted" | "generated";
  }[];
  facts: { kind: "date" | "formula"; value: string; context?: string }[];
  examples: string[];
  relationships: string[];
  checklist: string[];
  notices: string[];
}

export interface QuestionDraft {
  type: QuestionType;
  prompt: string;
  options?: string[];
  correct: string[];
  explanation: string;
  difficulty: Difficulty;
  sourceExcerpt?: string;
}

export interface CardDraft {
  front: string;
  back: string;
  explanation?: string;
  sourceRef?: string;
}

/** Every generation result says which kind of generator produced it and carries honest caveats. */
export interface Generated<T> {
  value: T;
  origin: Origin;
  notices: string[];
}

export type ProviderId = "offline" | "ollama" | "hosted";

export interface CallOptions {
  signal?: AbortSignal;
  /**
   * When the chosen AI provider fails, generate with offline heuristics instead. Off by default: the
   * UI shows the error and lets the user opt in, so output is never silently swapped.
   */
  allowOfflineFallback?: boolean;
}

/**
 * Provider abstraction. Business logic (storage, scoring, scheduling) never imports a concrete
 * provider; it only talks to this interface.
 */
export interface StudyProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** The origin recorded on anything this provider generates. */
  readonly origin: Origin;

  generateStudyNotes(
    input: SourceInput,
    options: NoteOptions,
    call?: CallOptions,
  ): Promise<Generated<NoteDraft>>;
  generateQuiz(
    input: SourceInput,
    options: QuizOptions,
    call?: CallOptions,
  ): Promise<Generated<QuestionDraft[]>>;
  generateFlashcards(
    input: SourceInput,
    options: CardOptions,
    call?: CallOptions,
  ): Promise<Generated<CardDraft[]>>;
  explainAnswer(
    input: { question: string; correctAnswer: string; userAnswer: string; sourceExcerpt?: string },
    call?: CallOptions,
  ): Promise<Generated<string>>;
  summarizeContent(input: SourceInput, call?: CallOptions): Promise<Generated<string>>;
}

export type ProviderErrorCode =
  | "unreachable"
  | "timeout"
  | "cancelled"
  | "model-missing"
  | "bad-response"
  | "invalid-output"
  | "not-configured"
  | "rate-limited"
  | "consent-required"
  | "http-error";

/** Error with a user-actionable message. The study UI falls back to offline generation on any of these. */
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Source text is truncated to this many characters before it is sent to a model. */
export const MAX_MODEL_INPUT_CHARS = 12_000;
