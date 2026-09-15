import type Database from "better-sqlite3";
import { overlapMatrix } from "../analysis/overlap";
import { marginalReach } from "../analysis/setcover";
import { loadEngagements } from "../agent/handlers/_shared";

const OVERLAP_EDGE_THRESHOLD = 0.15; // UI hides edges under 15% overlap (BUILD.md, UI section)

export interface SnapshotNode {
  handle: string;
  uniqueReach: number;
  followerCount: number | null;
  bio: string | null;
  clusterHint: string | null;
  addedBy: string | null;
  recommended: boolean;
  redundant: boolean;
  hookStyle: string | null;
}

export interface SnapshotEdge {
  a: string;
  b: string;
  overlapPct: number;
}

export interface DecisionLogEntry {
  seq: number;
  reasoning: string | null;
  toolName: string;
  toolInput: unknown;
  resultSummary: unknown;
  createdAt: string;
}

export interface ReportShape {
  headline_insight: string;
  recommended_lineup: { handle: string; unique_reach: number; marginal_gain_pct: number; hook_style?: string }[];
  redundant_pairs: { a: string; b: string; overlap_pct: number }[];
  hook_style_finding?: string;
  data_caveats?: string;
}

export interface CrawlStats {
  toolCallsUsed?: number;
  estimatedCostUsd?: number;
}
export interface VisionStats {
  postsClassified?: number;
  estimatedCostUsd?: number;
}

export interface Snapshot {
  generatedAt: string;
  headline: string;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  recommendedLineup: { handle: string; uniqueReach: number; marginalGainPct: number; hookStyle?: string }[];
  redundantPairs: SnapshotEdge[];
  hookStyleFinding: string | null;
  dataCaveats: string | null;
  decisionLog: DecisionLogEntry[];
  stats: {
    creatorsTracked: number;
    toolCallsUsed: number | null;
    crawlCostUsd: number | null;
    visionCostUsd: number | null;
    totalCostUsd: number | null;
  };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function representativeHookStyle(db: Database.Database, handle: string): string | null {
  const row = db
    .prepare(
      `SELECT hook_style FROM posts
       WHERE author_handle = ? AND hook_style IS NOT NULL
       ORDER BY reply_count DESC LIMIT 1`
    )
    .get(handle) as { hook_style: string } | undefined;
  return row?.hook_style ?? null;
}

export function buildSnapshot(
  db: Database.Database,
  report: ReportShape,
  crawlStats: CrawlStats | null,
  visionStats: VisionStats | null
): Snapshot {
  const creators = db
    .prepare(`SELECT handle, follower_count, bio, cluster_hint, added_by FROM creators`)
    .all() as { handle: string; follower_count: number | null; bio: string | null; cluster_hint: string | null; added_by: string | null }[];

  const edges = loadEngagements(db);
  const matrix = overlapMatrix(edges);
  const reach = marginalReach(edges, []);

  const recommendedHandles = new Set(report.recommended_lineup.map((c) => c.handle));
  const redundantHandles = new Set(report.redundant_pairs.flatMap((p) => [p.a, p.b]));

  const nodes: SnapshotNode[] = creators.map((c) => ({
    handle: c.handle,
    uniqueReach: reach[c.handle] ?? 0,
    followerCount: c.follower_count,
    bio: c.bio,
    clusterHint: c.cluster_hint,
    addedBy: c.added_by,
    recommended: recommendedHandles.has(c.handle),
    redundant: !recommendedHandles.has(c.handle) && redundantHandles.has(c.handle),
    hookStyle: representativeHookStyle(db, c.handle),
  }));

  const snapshotEdges: SnapshotEdge[] = [];
  const handles = Object.keys(matrix).sort();
  for (let i = 0; i < handles.length; i++) {
    for (let j = i + 1; j < handles.length; j++) {
      const a = handles[i];
      const b = handles[j];
      const overlap = matrix[a][b];
      if (overlap >= OVERLAP_EDGE_THRESHOLD) {
        snapshotEdges.push({ a, b, overlapPct: Math.round(overlap * 1000) / 10 });
      }
    }
  }

  const decisionLog = (
    db.prepare(`SELECT seq, reasoning, tool_name, tool_input, result_summary, created_at FROM agent_log ORDER BY seq`).all() as {
      seq: number;
      reasoning: string | null;
      tool_name: string;
      tool_input: string;
      result_summary: string;
      created_at: string;
    }[]
  ).map((r) => ({
    seq: r.seq,
    reasoning: r.reasoning,
    toolName: r.tool_name,
    toolInput: tryParseJson(r.tool_input),
    resultSummary: tryParseJson(r.result_summary),
    createdAt: r.created_at,
  }));

  const crawlCost = crawlStats?.estimatedCostUsd ?? null;
  const visionCost = visionStats?.estimatedCostUsd ?? null;

  return {
    generatedAt: new Date().toISOString(),
    headline: report.headline_insight,
    nodes,
    edges: snapshotEdges,
    recommendedLineup: report.recommended_lineup.map((c) => ({
      handle: c.handle,
      uniqueReach: c.unique_reach,
      marginalGainPct: c.marginal_gain_pct,
      hookStyle: c.hook_style,
    })),
    redundantPairs: report.redundant_pairs.map((p) => ({ a: p.a, b: p.b, overlapPct: p.overlap_pct })),
    hookStyleFinding: report.hook_style_finding ?? null,
    dataCaveats: report.data_caveats ?? null,
    decisionLog,
    stats: {
      creatorsTracked: nodes.length,
      toolCallsUsed: crawlStats?.toolCallsUsed ?? null,
      crawlCostUsd: crawlCost,
      visionCostUsd: visionCost,
      totalCostUsd: crawlCost !== null || visionCost !== null ? (crawlCost ?? 0) + (visionCost ?? 0) : null,
    },
  };
}
