import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuizPlayer } from "@/components/quiz/player";
import { QuizResults } from "@/components/quiz/results";
import { UiProvider } from "@/components/ui/primitives";
import type { Quiz, QuizAttempt } from "@/lib/validation/schemas";

const iso = "2026-06-01T10:00:00.000Z";
const quiz: Quiz = {
  id: "quiz1",
  title: "Cells",
  origin: "heuristic",
  difficulty: "easy",
  language: "same as source",
  tags: [],
  createdAt: iso,
  updatedAt: iso,
  questions: [
    {
      id: "q1",
      type: "mcq",
      prompt: "Powerhouse of the cell?",
      options: ["Nucleus", "Mitochondria", "Ribosome"],
      correct: ["Mitochondria"],
      explanation: "It makes ATP.",
      difficulty: "easy",
      tags: [],
    },
    {
      id: "q2",
      type: "fill",
      prompt: "The ____ stores DNA.",
      correct: ["nucleus"],
      explanation: "",
      difficulty: "easy",
      tags: [],
    },
  ],
};

function setup(mode: "immediate" | "end") {
  const onFinish = vi.fn<(a: QuizAttempt) => void>();
  render(
    <UiProvider>
      <QuizPlayer quiz={quiz} feedbackMode={mode} onFinish={onFinish} onExit={vi.fn()} />
    </UiProvider>,
  );
  return { onFinish, user: userEvent.setup() };
}

describe("QuizPlayer", () => {
  it("hides the answer until checked, then explains (immediate mode)", async () => {
    const { user } = setup("immediate");
    expect(screen.queryByText(/Correct answer/)).toBeNull();
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Nucleus" }));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText("Correct answer: Mitochondria")).toBeInTheDocument();
    expect(screen.getByText("It makes ATP.")).toBeInTheDocument();
  });

  it("gives no feedback before the end in end-of-quiz mode", async () => {
    const { user } = setup("end");
    expect(screen.queryByRole("button", { name: "Check answer" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Mitochondria" }));
    expect(screen.queryByText("Correct")).toBeNull();
  });

  it("scores the attempt, counting skipped questions as incorrect", async () => {
    const { user, onFinish } = setup("end");
    await user.click(screen.getByRole("radio", { name: "Mitochondria" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    const attempt = onFinish.mock.calls[0]![0];
    expect(attempt).toMatchObject({ quizId: "quiz1", score: 1, total: 2, feedbackMode: "end" });
    expect(attempt.answers.find((a) => a.questionId === "q2")).toMatchObject({
      skipped: true,
      correct: false,
    });
  });

  it("grades typed fill-in answers ignoring case, punctuation and spacing", async () => {
    const { user, onFinish } = setup("end");
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await user.type(screen.getByLabelText("Your answer"), "  NUCLEUS! ");
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(onFinish.mock.calls[0]![0].answers.find((a) => a.questionId === "q2")?.correct).toBe(
      true,
    );
  });
});

describe("QuizResults", () => {
  const attempt: QuizAttempt = {
    id: "a1",
    quizId: "quiz1",
    quizTitle: "Cells",
    feedbackMode: "end",
    score: 1,
    total: 2,
    startedAt: iso,
    completedAt: iso,
    answers: [
      { questionId: "q1", response: "Mitochondria", correct: true, skipped: false },
      { questionId: "q2", response: "", correct: false, skipped: true },
    ],
  };
  it("shows score, correct answers and lets the learner retry only missed questions", async () => {
    const user = userEvent.setup();
    const onRetryMissed = vi.fn();
    render(
      <QuizResults
        quiz={quiz}
        attempt={attempt}
        onRetry={vi.fn()}
        onRetryMissed={onRetryMissed}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("score")).toHaveTextContent("1 / 2");
    expect(screen.getByText("50% correct")).toBeInTheDocument();
    expect(screen.getByText("nucleus")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /only questions I missed/ }));
    expect(screen.queryByText(/Powerhouse/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Retry missed/ }));
    expect(onRetryMissed).toHaveBeenCalledWith(["q2"]);
  });
});
