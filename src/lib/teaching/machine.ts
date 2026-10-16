import type { Phase, TeachingState } from "@/lib/schemas";

/**
 * Pure teaching state machine. Transitions are decided here, in code — never by a model.
 *
 * introduction → explanation → guided_practice / independent_attempt → (correction) → recap → completion
 */
export const MAX_GUIDED_WRONG = 2;

export interface MachineContext {
  state: TeachingState;
  index: number; // explanation step while in "explanation"; activity index otherwise
  explanationSteps: number;
  phases: Phase[]; // phase of each activity, in order
  wrongOnCurrent: number; // wrong attempts so far on the current activity
}
export type MachineEvent = { type: "continue" } | { type: "answer"; correct: boolean };
export interface MachineResult {
  state: TeachingState;
  index: number;
}

export class InvalidTransition extends Error {
  constructor(public from: TeachingState, public event: string) {
    super(`Event "${event}" is not allowed in state "${from}"`);
  }
}

function enter(index: number, phases: Phase[]): MachineResult {
  if (index >= phases.length) return { state: "recap", index: phases.length };
  return { state: phases[index] === "guided" ? "guided_practice" : "independent_attempt", index };
}

export function transition(ctx: MachineContext, ev: MachineEvent): MachineResult {
  const { state, index, phases, wrongOnCurrent } = ctx;
  switch (state) {
    case "introduction":
      if (ev.type === "continue") return { state: "explanation", index: 0 };
      break;
    case "explanation":
      if (ev.type === "continue") {
        return index + 1 < ctx.explanationSteps ? { state, index: index + 1 } : enter(0, phases);
      }
      break;
    case "guided_practice":
      if (ev.type === "answer") {
        if (ev.correct) return enter(index + 1, phases);
        return wrongOnCurrent + 1 >= MAX_GUIDED_WRONG ? { state: "correction", index } : { state, index };
      }
      break;
    case "independent_attempt":
      if (ev.type === "answer") return ev.correct ? enter(index + 1, phases) : { state: "correction", index };
      break;
    case "correction":
      if (ev.type === "continue") return enter(index + 1, phases);
      break;
    case "recap":
      if (ev.type === "continue") return { state: "completion", index };
      break;
    case "completion":
      break;
  }
  throw new InvalidTransition(state, ev.type);
}

export const canUseHints = (state: TeachingState) => state === "guided_practice";
export const acceptsAnswers = (state: TeachingState) => state === "guided_practice" || state === "independent_attempt";
