import Anthropic from "@anthropic-ai/sdk";
import type Database from "better-sqlite3";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOLS } from "./tools";
import { createToolRunner } from "./handlers/index";
import type { ScraperAdapter } from "../data/twitterapi";
import { MODEL, estimateCostUsd } from "./pricing";

const MAX_CALLS = 120;

// classify_hook_style is deliberately withheld here -- the vision pass runs
// as its own phase after the crawl settles (BUILD.md step 7), not inside
// this loop. The system prompt still mentions it as step 6 of METHOD; that
// step simply doesn't fire on this pass.
const LOOP_TOOLS = TOOLS.filter((t) => t.name !== "classify_hook_style") as unknown as Anthropic.Tool[];

export interface CrawlResult {
  report: unknown | null;
  toolCallsUsed: number;
  cacheHits: number;
  estimatedCostUsd: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * The Messages API is stateless -- every turn resends the whole
 * conversation so far. Without caching, cost grows with every turn since
 * each request re-pays full price for everything already sent. Prompt
 * caching lets the API mark a prefix as reusable: a cache write costs
 * ~1.25x base price once, then every later turn that resends the same
 * prefix pays only ~0.1x for it. We place a moving breakpoint at the end of
 * the newest message each turn, so next turn's identical-so-far prefix is
 * served from cache instead of billed at full price.
 */
function setCacheBreakpoint(messages: Anthropic.MessageParam[]): void {
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (typeof block === "object" && block !== null && "cache_control" in block) {
          delete (block as { cache_control?: unknown }).cache_control;
        }
      }
    }
  }
  const last = messages[messages.length - 1];
  if (Array.isArray(last.content) && last.content.length > 0) {
    const tail = last.content[last.content.length - 1] as { cache_control?: Anthropic.CacheControlEphemeral };
    tail.cache_control = { type: "ephemeral" };
  }
}

export async function runAgentLoop(
  db: Database.Database,
  adapter: ScraperAdapter,
  seedHandles: string[]
): Promise<CrawlResult> {
  const client = new Anthropic();
  const runTool = createToolRunner(db, adapter);

  const logCall = db.prepare(
    `INSERT INTO agent_log (reasoning, tool_name, tool_input, result_summary, created_at)
     VALUES (@reasoning, @toolName, @toolInput, @resultSummary, @now)`
  );

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Seed creators: ${seedHandles.join(", ")}. Platform priority: X first, LinkedIn second. Begin.`,
        },
      ],
    },
  ];

  let calls = 0;
  let cacheHits = 0;
  let totalCost = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;
  let report: unknown | null = null;

  while (calls < MAX_CALLS) {
    setCacheBreakpoint(messages);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: LOOP_TOOLS,
      messages,
    });

    const turnCost = estimateCostUsd(response.usage);
    totalCost += turnCost;
    totalCacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    totalCacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;

    console.log(
      `  [turn] stop_reason=${response.stop_reason} calls=${calls}/${MAX_CALLS} ` +
        `cache_read=${response.usage.cache_read_input_tokens ?? 0} cache_write=${response.usage.cache_creation_input_tokens ?? 0} ` +
        `total cost so far=$${totalCost.toFixed(4)}`
    );

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
      break;
    }

    const reasoning = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let stopForReport = false;

    for (const use of toolUses) {
      if (calls >= MAX_CALLS) break;

      let result: unknown;
      let isError = false;
      try {
        result = await runTool(use.name, use.input);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
        isError = true;
      }

      // Cache hits don't count against the budget (BUILD.md, Budget and cost control).
      const cacheHit =
        typeof result === "object" && result !== null && (result as { cacheHit?: boolean }).cacheHit === true;
      if (cacheHit) cacheHits++;
      else calls++;

      logCall.run({
        reasoning: reasoning || null,
        toolName: use.name,
        toolInput: JSON.stringify(use.input),
        resultSummary: JSON.stringify(result).slice(0, 2000),
        now: new Date().toISOString(),
      });

      if (use.name === "emit_report" && (result as { accepted?: boolean }).accepted) {
        report = use.input;
        stopForReport = true;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(result),
        is_error: isError,
      });
    }

    messages.push({ role: "user", content: toolResults });

    if (stopForReport) break;
  }

  return {
    report,
    toolCallsUsed: calls,
    cacheHits,
    estimatedCostUsd: totalCost,
    cacheReadTokens: totalCacheReadTokens,
    cacheCreationTokens: totalCacheCreationTokens,
  };
}
