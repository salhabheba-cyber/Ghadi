import type { Locale, TeacherTurn } from "@/lib/schemas";

/**
 * Provider-independent interfaces. Only the entries marked "implemented" exist today.
 * Nothing here may be reported to a user as working unless it was configured and tested.
 */
export interface TeacherContext {
  lessonVersionId: string;
  lessonLanguage: Locale;
  explanationLanguage: Locale;
  childName: string;
  event:
    | { type: "greeting"; lessonTitle: string }
    | { type: "explain"; text: string }
    | { type: "prompt"; activityId: string; prompt: string }
    | { type: "feedback"; activityId: string; correct: boolean; attemptNumber: number }
    | { type: "hint"; activityId: string; hint: string }
    | { type: "correction"; activityId: string; explanation: string }
    | { type: "recap"; text: string; correct: number; total: number }
    | { type: "goodbye" };
}

/** LLM-backed teachers MUST return data that passes `TeacherTurn.parse`; invalid output is discarded. */
export interface TeacherProvider {
  readonly id: string;
  readonly mode: "demo" | "llm";
  readonly label: string;
  nextTurn(ctx: TeacherContext): Promise<TeacherTurn>;
}

export interface SpeechCapabilities {
  provider: string;
  available: boolean;
  reason?: string;
}

// STUB interfaces (no implementation yet): server-side STT/TTS, OCR and avatar providers.
export interface SpeechToTextProvider { readonly id: string; transcribe(audio: Blob, lang: Locale): Promise<{ text: string; confidence: number | null }>; }
export interface TextToSpeechProvider { readonly id: string; synthesize(text: string, lang: Locale): Promise<Blob>; }
export interface OcrProvider { readonly id: string; extract(file: Blob): Promise<{ text: string; lowConfidenceSpans: { start: number; end: number }[] }>; }
export interface AvatarProvider { readonly id: string; readonly realistic: boolean; }
