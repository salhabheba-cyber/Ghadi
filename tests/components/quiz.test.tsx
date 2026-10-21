import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  includeExplanations: true,
  feedbackMode: "end",
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

beforeEach(() => localStorage.clear());

function setup(mode: "immediate" | "end", props: { timeLimitMin?: number } = {}) {
  const onFinish = vi.fn<(a: QuizAttempt) => void>();
  const view = render(
    <UiProvider>
      <QuizPlayer quiz={quiz} feedbackMode={mode} onFinish={onFinish} onExit={vi.fn()} {...props} />
    </UiProvider>,
  );
  return { onFinish, user: userEvent.setup(), view };
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: /Submit|Review & submit/ })[0]!);
  await user.click(screen.getByRole("button", { name: "Submit exam" }));
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
    await submit(user);
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
    await submit(user);
    expect(onFinish.mock.calls[0]![0].answers.find((a) => a.questionId === "q2")?.correct).toBe(
      true,
    );
  });
});

describe("QuizPlayer exam features", () => {
  it("jumps to a question by number and flags unanswered ones", async () => {
    const { user } = setup("end");
    expect(screen.getByRole("button", { name: "Question 2, unanswered" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Question 2, unanswered" }));
    expect(screen.getByText(/The ____ stores DNA/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await user.click(screen.getByRole("radio", { name: "Nucleus" }));
    expect(screen.getByRole("button", { name: "Question 1, answered" })).toBeInTheDocument();
  });

  it("lets the learner edit an answer before submitting", async () => {
    const { user, onFinish } = setup("end");
    await user.click(screen.getByRole("radio", { name: "Nucleus" }));
    await user.click(screen.getByRole("radio", { name: "Mitochondria" }));
    await submit(user);
    expect(onFinish.mock.calls[0]![0].score).toBe(1);
  });

  it("marks questions for review", async () => {
    const { user } = setup("end");
    await user.click(screen.getByRole("button", { name: "Mark for review" }));
    expect(
      screen.getByRole("button", { name: /Question 1, unanswered, marked for review/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Marked for review/ }));
    expect(screen.getByRole("button", { name: "Question 1, unanswered" })).toBeInTheDocument();
  });

  it("asks for confirmation and reports what is unanswered; nothing is submitted until confirmed", async () => {
    const { user, onFinish } = setup("end");
    await user.click(screen.getByRole("radio", { name: "Mitochondria" }));
    await user.click(screen.getAllByRole("button", { name: /Submit/ })[0]!);
    expect(screen.getByText("Submit your exam?")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 answered/)).toBeInTheDocument();
    expect(screen.getByText(/1 unanswered \(2\)/)).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep working" }));
    expect(screen.queryByText("Submit your exam?")).toBeNull();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("auto-saves answers and restores them after a refresh, then clears on submit", async () => {
    const first = setup("end");
    await first.user.click(screen.getByRole("radio", { name: "Mitochondria" }));
    first.view.unmount();
    const second = setup("end");
    expect(screen.getByText("Your saved progress was restored.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mitochondria" })).toBeChecked();
    await submit(second.user);
    expect(second.onFinish.mock.calls[0]![0].score).toBe(1);
    expect(localStorage.getItem("ghadi:exam:quiz1")).toBeNull();
  });

  it("does not leak the correct answer in the DOM before submission", async () => {
    setup("end");
    expect(document.body.innerHTML).not.toContain("It makes ATP.");
    expect(screen.queryByText(/Correct answer/)).toBeNull();
  });

  it("shows a countdown timer that survives a refresh", async () => {
    const { view } = setup("end", { timeLimitMin: 10 });
    expect(screen.getByRole("timer")).toHaveTextContent(/9:5\d|10:00/);
    const saved = JSON.parse(localStorage.getItem("ghadi:exam:quiz1")!) as { deadline: number };
    view.unmount();
    setup("end", { timeLimitMin: 10 });
    const again = JSON.parse(localStorage.getItem("ghadi:exam:quiz1")!) as { deadline: number };
    expect(again.deadline).toBe(saved.deadline);
  });

  it("auto-submits when time runs out", async () => {
    vi.useFakeTimers();
    try {
      const onFinish = vi.fn<(a: QuizAttempt) => void>();
      render(
        <UiProvider>
          <QuizPlayer
            quiz={quiz}
            feedbackMode="end"
            timeLimitMin={1}
            onFinish={onFinish}
            onExit={vi.fn()}
          />
        </UiProvider>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
      expect(onFinish).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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
