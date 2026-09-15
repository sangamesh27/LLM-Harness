// BUILD.md step 7: after the crawl settles, classify each creator's top 3
// posts by reply count that have media. Runs as its OWN phase, separate
// from the agent loop -- it is a finding, not a decision input.
//
// Cost note: rather than one Claude call per post (matching the literal
// per-post classify_hook_style tool schema in docs/agent-config.md), this
// batches up to 3 images into ONE call per creator. Same classification
// coverage, far fewer requests.

import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { openDb } from "../src/db/index.ts";
import { loadDotEnv } from "../src/util/env.ts";
import { MODEL, estimateCostUsd } from "../src/agent/pricing.ts";

loadDotEnv(path.join(process.cwd(), ".env"));

const DB_PATH = path.join(process.cwd(), ".data", "crawl.db");
if (!existsSync(DB_PATH)) {
  console.error("No .data/crawl.db found. Run `npm run db:init` and `npm run crawl` first.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. See .env.example.");
  process.exit(1);
}

const HOOK_STYLES = ["talking_head", "screen_recording", "text_card", "chart", "meme", "carousel", "none"] as const;

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_posts",
  description: "Classify the hook style of each post shown, using its image and opening text.",
  input_schema: {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            post_id: { type: "string" },
            hook_style: { type: "string", enum: [...HOOK_STYLES] },
          },
          required: ["post_id", "hook_style"],
        },
      },
    },
    required: ["classifications"],
  },
};

function imageBlockFor(mediaPath: string): Anthropic.ImageBlockParam {
  if (mediaPath.startsWith("http")) {
    return { type: "image", source: { type: "url", url: mediaPath } };
  }
  const abs = path.join(process.cwd(), mediaPath);
  const data = readFileSync(abs).toString("base64");
  return { type: "image", source: { type: "base64", media_type: "image/png", data } };
}

async function main() {
  const db = openDb();
  const client = new Anthropic();

  const creators = db.prepare(`SELECT handle FROM creators`).all() as { handle: string }[];

  let totalCost = 0;
  let postsClassified = 0;
  let creatorsProcessed = 0;

  for (const { handle } of creators) {
    const posts = db
      .prepare(
        `SELECT id, text, media_urls FROM posts
         WHERE author_handle = ? AND media_urls != '[]'
         ORDER BY reply_count DESC LIMIT 3`
      )
      .all(handle) as { id: string; text: string; media_urls: string }[];

    if (posts.length === 0) continue;

    const content: Anthropic.ContentBlockParam[] = [];
    for (const post of posts) {
      const [mediaPath] = JSON.parse(post.media_urls) as string[];
      content.push(imageBlockFor(mediaPath));
      content.push({ type: "text", text: `Post ${post.id}: "${post.text}"` });
    }
    content.push({ type: "text", text: "Classify each post above with the classify_posts tool." });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_posts" },
      messages: [{ role: "user", content }],
    });

    totalCost += estimateCostUsd(response.usage);

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const classifications = (toolUse?.input as { classifications?: { post_id: string; hook_style: string }[] })
      ?.classifications ?? [];

    const update = db.prepare(`UPDATE posts SET hook_style = ? WHERE id = ?`);
    for (const c of classifications) {
      update.run(c.hook_style, c.post_id);
      postsClassified++;
    }

    creatorsProcessed++;
    console.log(
      `  ${handle.padEnd(20)} ${classifications.length} posts classified (${classifications.map((c) => c.hook_style).join(", ")})`
    );
  }

  console.log(`\n=== Vision pass finished ===`);
  console.log(`Creators processed: ${creatorsProcessed}, posts classified: ${postsClassified}`);
  console.log(`Estimated cost: $${totalCost.toFixed(4)}`);

  writeFileSync(
    path.join(process.cwd(), ".data", "vision-stats.json"),
    JSON.stringify({ creatorsProcessed, postsClassified, estimatedCostUsd: totalCost, finishedAt: new Date().toISOString() }, null, 2)
  );

  db.close();
}

main();
