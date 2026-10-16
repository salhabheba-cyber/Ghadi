/**
 * Mastery is an ESTIMATE derived only from stored attempt evidence. It is never set because a session ended.
 * Independent, hint-free attempts count fully; hinted/guided attempts count half.
 */
export interface Evidence {
  success: boolean;
  independent: boolean;
}

export type MasteryLabel = "not_enough_evidence" | "emerging" | "developing" | "consistent";

export interface MasteryEstimate {
  estimate: number; // 0..1, posterior mean of a Beta(1,1) prior over weighted evidence
  evidenceCount: number;
  independentSuccesses: number;
  label: MasteryLabel;
}

export const MIN_EVIDENCE = 3;

export function computeMastery(evidence: Evidence[]): MasteryEstimate {
  let wSuccess = 0;
  let wTotal = 0;
  let independentSuccesses = 0;
  for (const e of evidence) {
    const w = e.independent ? 1 : 0.5;
    wTotal += w;
    if (e.success) {
      wSuccess += w;
      if (e.independent) independentSuccesses++;
    }
  }
  const estimate = Math.round(((wSuccess + 1) / (wTotal + 2)) * 1000) / 1000;
  let label: MasteryLabel;
  if (evidence.length < MIN_EVIDENCE) label = "not_enough_evidence";
  else if (estimate >= 0.8 && independentSuccesses >= 2) label = "consistent";
  else if (estimate >= 0.5) label = "developing";
  else label = "emerging";
  return { estimate, evidenceCount: evidence.length, independentSuccesses, label };
}
