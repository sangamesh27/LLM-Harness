import { writeFileSync } from "node:fs";
import path from "node:path";

export interface EmitReportInput {
  headline_insight: string;
  recommended_lineup: { handle: string; unique_reach: number; marginal_gain_pct: number; hook_style?: string }[];
  redundant_pairs: { a: string; b: string; overlap_pct: number }[];
  hook_style_finding?: string;
  data_caveats?: string;
}

export interface EmitReportResult {
  accepted: boolean;
  reason?: string;
}

const REPORT_PATH = path.join(process.cwd(), ".data", "report.json");

// "The headline_insight must contain a number and name real handles. If it
// comes back as 'there is significant overlap among B2B creators', the whole
// build reads as generic." -- docs/agent-config.md
export function emitReport(input: EmitReportInput): EmitReportResult {
  if (!/\d/.test(input.headline_insight)) {
    return { accepted: false, reason: "headline_insight must contain a number" };
  }
  if (
    input.recommended_lineup.length > 0 &&
    !input.recommended_lineup.some((c) => input.headline_insight.includes(c.handle))
  ) {
    return { accepted: false, reason: "headline_insight must name a real handle from recommended_lineup" };
  }

  writeFileSync(REPORT_PATH, JSON.stringify(input, null, 2));
  return { accepted: true };
}
