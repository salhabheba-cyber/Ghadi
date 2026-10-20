import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudySession } from "@/components/flashcards/session";
import { UiProvider } from "@/components/ui/primitives";
import { __setDbForTests, GhadiDB, getDb } from "@/lib/storage/db";
import { addCards, saveDeck } from "@/lib/storage/repo";
import type { Card } from "@/lib/validation/schemas";

const iso = "2026-06-01T10:00:00.000Z";
let cards: Card[];

beforeEach(async () => {
  __setDbForTests(new GhadiDB(`session-${Math.random()}`));
  await saveDeck({
    id: "d1",
    title: "Deck",
    description: "",
    origin: "manual",
    tags: [],
    createdAt: iso,
    updatedAt: iso,
  });
  cards = await addCards("d1", [
    { front: "Q1", back: "A1", origin: "manual" },
    { front: "Q2", back: "A2", origin: "manual" },
  ]);
});

function setup(onDone = vi.fn()) {
  render(
    <UiProvider>
      <StudySession cards={cards} onDone={onDone} />
    </UiProvider>,
  );
  return { onDone, user: userEvent.setup() };
}

describe("StudySession", () => {
  it("flips with Space and rates with number keys, persisting schedule and log", async () => {
    const { user, onDone } = setup();
    expect(screen.getByText("Q1")).toBeInTheDocument();
    await user.keyboard(" ");
    expect(screen.getByText("A1")).toBeInTheDocument();
    await user.keyboard("3");
    await waitFor(() => expect(screen.getByText("Q2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: /^Difficult/ }));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ reviewed: 2, known: 1, difficult: 1, forgotten: 0 }),
    );
    const logs = await getDb().reviews.toArray();
    expect(logs.map((l) => l.rating).sort()).toEqual(["difficult", "known"]);
    const stored = await getDb().cards.get(cards[0]!.id);
    expect(stored?.schedule.repetitions).toBe(1);
  });

  it("does not accept a rating before the answer is revealed", async () => {
    const { user } = setup();
    await user.keyboard("3");
    expect(await getDb().reviews.count()).toBe(0);
    expect(screen.getByText("Q1")).toBeInTheDocument();
  });

  it("shows the interval each rating would give", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByRole("button", { name: /Forgotten \(<1d\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Known \(1d\)/ })).toBeInTheDocument();
  });

  it("requeues forgotten cards until they are answered", async () => {
    const { user, onDone } = setup();
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: /^Forgotten/ }));
    await waitFor(() => expect(screen.getByText("Q2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: /^Known/ }));
    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: /^Known/ }));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ reviewed: 3, known: 2, difficult: 0, forgotten: 1 }),
    );
  });
});
