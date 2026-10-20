import type {
  CardDraft,
  CardOptions,
  Generated,
  NoteDraft,
  NoteOptions,
  QuestionDraft,
  QuizOptions,
  SourceInput,
  StudyProvider,
} from "./types";
import {
  generateCardsHeuristic,
  generateNotesHeuristic,
  generateQuestionsHeuristic,
  summarizeHeuristic,
} from "@/lib/study/heuristic";

/** Deterministic, model-free provider. This is the default and always works without network access. */
export class OfflineProvider implements StudyProvider {
  readonly id = "offline" as const;
  readonly label = "Offline (heuristic)";
  readonly origin = "heuristic" as const;

  async generateStudyNotes(
    input: SourceInput,
    options: NoteOptions,
  ): Promise<Generated<NoteDraft>> {
    const value = generateNotesHeuristic(input.title, input.text);
    const notices = [...value.notices];
    if (options.language !== "same as source" && !/^english$/i.test(options.language)) {
      notices.push(
        `Offline generation cannot translate: notes stay in the source's language, not ${options.language}.`,
      );
    }
    return { value: { ...value, notices }, origin: this.origin, notices };
  }

  async generateQuiz(
    input: SourceInput,
    options: QuizOptions,
  ): Promise<Generated<QuestionDraft[]>> {
    const { questions, notices } = generateQuestionsHeuristic(input.text, options);
    return { value: questions, origin: this.origin, notices };
  }

  async generateFlashcards(
    input: SourceInput,
    options: CardOptions,
  ): Promise<Generated<CardDraft[]>> {
    const { cards, notices } = generateCardsHeuristic(input.text, options);
    return { value: cards, origin: this.origin, notices };
  }

  async explainAnswer(input: {
    question: string;
    correctAnswer: string;
    userAnswer: string;
    sourceExcerpt?: string;
  }): Promise<Generated<string>> {
    const parts = [`The expected answer is: ${input.correctAnswer}.`];
    if (input.sourceExcerpt) parts.push(`From your source: ${input.sourceExcerpt}`);
    return {
      value: parts.join(" "),
      origin: this.origin,
      notices: [
        "This explanation only quotes your saved answer and source excerpt. No AI model was used.",
      ],
    };
  }

  async summarizeContent(input: SourceInput): Promise<Generated<string>> {
    return {
      value: summarizeHeuristic(input.text),
      origin: this.origin,
      notices: [
        "Extractive summary: the most representative sentences from your source. No AI model was used.",
      ],
    };
  }
}
