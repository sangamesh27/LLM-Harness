# Creator Overlap Mapper, build brief

Hand this to Claude Code as the first message. Keep `docs/agent-config.md`
(the system prompt and tool definitions) in the repo as a reference doc and
tell Claude Code to read it before implementing the loop.

---

## What we are building

A harness that maps audience overlap between B2B creators on X, then reports
the smallest creator lineup that reaches the most distinct people.

The output is one number-carrying insight, e.g. "these 6 creators share 61%
of their engaged audience; swapping two of them for devtools voices adds 34%
unique reach."

An LLM agent drives the crawl. It decides which creators to fetch, when a
creator is saturated, which adjacent creators to add, and when to stop. This
is not a script with a for-loop.

---

## Stack

- Next.js 15, App Router, TypeScript
- better-sqlite3 for the crawl store, local only
- Anthropic Messages API with tool use, model `claude-sonnet-4-6`
- twitterapi.io for all X data
- Tailwind + a force-directed graph (d3-force, canvas render)
- Vercel for the static demo

**Two runtimes, keep them separate:**

1. `pnpm crawl` — a local Node script. Runs the agent loop, writes SQLite,
   then exports `public/snapshot.json`.
2. The Next.js app — reads `snapshot.json` only. No DB access, no API keys
   in the deployed app. It renders the graph, the lineup, and the agent's
   decision log.

This keeps the deployed demo fast, free, and impossible to break live.

---

## File layout

```
/scripts/crawl.ts            entry point for pnpm crawl
/src/agent/loop.ts           the tool-use loop
/src/agent/prompt.ts         system prompt, lifted from docs/agent-config.md
/src/agent/tools.ts          tool schemas
/src/agent/handlers/         one file per tool handler
/src/data/twitterapi.ts      scraper adapter
/src/data/cache.ts           disk cache
/src/db/schema.sql
/src/db/index.ts
/src/analysis/overlap.ts     pure functions
/src/analysis/setcover.ts    pure functions
/src/export/snapshot.ts      SQLite to snapshot.json
/config/seeds.json
/app/page.tsx                graph + lineup + decision log
/fixtures/                   recorded API responses
```

---

## Scraper adapter contract

Everything goes through this interface. No twitterapi.io types leak past it.
We may swap providers.

```typescript
export interface ScraperAdapter {
  getUserPosts(handle: string, limit: number): Promise<Post[]>;
  getPostEngagers(postIds: string[]): Promise<Engager[]>;
  resolveHandle(handle: string): Promise<{ exists: boolean; userId?: string }>;
}

export interface Post {
  id: string;
  authorHandle: string;
  text: string;
  mediaUrls: string[];
  likeCount: number;
  replyCount: number;
  retweetCount: number;
  createdAt: string;
}

export interface Engager {
  handle: string;
  userId: string;
  followerCount: number;
  bio: string;
  engagedPostId: string;
  engagementType: "reply" | "quote" | "retweet";
}
```

Implement `TwitterApiIoAdapter` and `FixtureAdapter`. Select via
`SCRAPER=fixtures|live`. Default to fixtures.

---

## Schema

```sql
CREATE TABLE creators (
  handle TEXT PRIMARY KEY,
  user_id TEXT,
  follower_count INTEGER,
  bio TEXT,
  cluster_hint TEXT,          -- from seeds, NEVER shown to the agent
  saturated INTEGER DEFAULT 0,
  posts_fetched INTEGER DEFAULT 0,
  added_by TEXT,              -- 'seed' or 'agent'
  added_at TEXT
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_handle TEXT NOT NULL,
  text TEXT,
  media_urls TEXT,            -- JSON array
  like_count INTEGER,
  reply_count INTEGER,
  retweet_count INTEGER,
  created_at TEXT,
  hook_style TEXT,            -- filled by the vision pass
  FOREIGN KEY (author_handle) REFERENCES creators(handle)
);

CREATE TABLE engagers (
  user_id TEXT PRIMARY KEY,
  handle TEXT,
  follower_count INTEGER,
  bio TEXT
);

CREATE TABLE engagements (
  engager_user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  creator_handle TEXT NOT NULL,
  engagement_type TEXT,
  PRIMARY KEY (engager_user_id, post_id)
);

CREATE INDEX idx_eng_creator ON engagements(creator_handle);
CREATE INDEX idx_eng_user ON engagements(engager_user_id);

CREATE TABLE agent_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  reasoning TEXT,             -- the agent's one-line why
  tool_name TEXT,
  tool_input TEXT,
  result_summary TEXT,
  created_at TEXT
);
```

`cluster_hint` exists so we can check afterwards whether the agent
rediscovered our groupings. It must never appear in any prompt or tool result.

---

## Analysis functions

Pure, no DB access, unit tested.

```typescript
// Jaccard overlap between every creator pair
overlapMatrix(edges: Engagement[]): Record<string, Record<string, number>>

// How many NEW engagers each creator adds, given a set already chosen
marginalReach(edges: Engagement[], chosen: string[]): Record<string, number>

// Greedy set cover to hit target coverage of the total unique pool
minimumLineup(edges: Engagement[], target: number): LineupStep[]
```

Test each with a hand-built 5-creator fixture where you know the answer.
Do not trust these against live data until the fixture tests pass.

---

## Budget and cost control

- Hard cap 120 tool calls per run, enforced in the loop, not the prompt
- Cache every scraper response to `.cache/<handle>-<YYYYMMDD>.json`
- Cache hits do not count against the call budget
- Log estimated cost per call and print a running total
- `MAX_ENGAGERS_PER_POST=100`, truncate beyond that and mark partial

Assume replies are the engagement type with real signal. Retweets are noisy
and cheap to fake. Weight replies and quotes higher if you weight at all.

---

## Vision pass

After the crawl settles, take each creator's top 3 posts by reply count that
have media. Send the image or video thumbnail plus the opening two lines to
the model. Classify into: talking_head, screen_recording, text_card, chart,
meme, carousel, none. Write to `posts.hook_style`.

Run this as a separate phase, not inside the main loop. It is not a decision
input, it is a finding.

---

## UI, one page

Three regions, in this order of importance:

1. **Headline insight**, huge type, top of page. Contains a number.
2. **Force-directed graph.** Node size = unique reach. Edge thickness =
   overlap. Edges under 15% overlap are hidden. Recommended lineup nodes are
   highlighted, redundant ones dimmed.
3. **Agent decision log**, a scrollable column of the reasoning lines with
   the tool each one triggered.

Region 3 is the proof this is a harness. Do not bury it in a tab.

No empty state. The page loads with the snapshot already populated.

---

## Build order

Do not skip ahead. Each step must run before the next starts.

1. Schema + `pnpm db:init`
2. Scraper adapter + FixtureAdapter + `resolveHandle` verification pass over
   `config/seeds.json`, printing which handles are dead
3. Analysis functions + unit tests against a hand-built fixture
4. Tool handlers, each independently callable from a test script
5. The agent loop, run first against fixtures only
6. First live crawl, 10 creators, inspect the log by hand before scaling
7. Vision pass
8. Snapshot export
9. UI

Step 6 is a checkpoint. Read the agent's decisions. If it is fetching in seed
order and never calling `suggest_adjacent_creators`, the prompt is not working
and no amount of UI will fix it.

---

## Seeds, X only

LinkedIn-native creators are dropped since we are X-only. Verify every handle
with `resolveHandle` before the first live run and delete what fails. The
confidence notes are honest, do not assume.

```json
{
  "gtm_marketing": [
    { "handle": "thejustinwelsh", "confidence": "medium" },
    { "handle": "davegerhardt", "confidence": "medium" },
    { "handle": "aprildunford", "confidence": "high" },
    { "handle": "amandanat", "confidence": "high" },
    { "handle": "peeplaja", "confidence": "medium" }
  ],
  "sales": [
    { "handle": "jasonlk", "confidence": "high" },
    { "handle": "sangramvajre", "confidence": "medium" },
    { "handle": "iannarino", "confidence": "medium" },
    { "handle": "retentionadam", "confidence": "low" }
  ],
  "product_growth": [
    { "handle": "lennysan", "confidence": "high" },
    { "handle": "gregisenberg", "confidence": "high" },
    { "handle": "rrhoover", "confidence": "high" },
    { "handle": "elenaverna", "confidence": "medium" }
  ],
  "indie": [
    { "handle": "levelsio", "confidence": "high" },
    { "handle": "tdinh_me", "confidence": "high" },
    { "handle": "damengchen", "confidence": "high" },
    { "handle": "arvidkahl", "confidence": "high" },
    { "handle": "dannypostmaa", "confidence": "high" },
    { "handle": "thepatwalls", "confidence": "medium" },
    { "handle": "thisiskp_", "confidence": "medium" },
    { "handle": "marc_louvion", "confidence": "low" }
  ],
  "devtools": [
    { "handle": "swyx", "confidence": "high" },
    { "handle": "rauchg", "confidence": "high" },
    { "handle": "adamwathan", "confidence": "high" },
    { "handle": "shadcn", "confidence": "high" },
    { "handle": "leeerob", "confidence": "high" },
    { "handle": "kentcdodds", "confidence": "high" },
    { "handle": "t3dotgg", "confidence": "medium" }
  ],
  "ai": [
    { "handle": "mattshumer_", "confidence": "medium" },
    { "handle": "alexalbert__", "confidence": "medium" },
    { "handle": "danshipper", "confidence": "medium" }
  ]
}
```

The category keys are for our post-hoc check only. Strip them before anything
reaches the agent, which should receive a flat shuffled array of handles.

---

## Definition of done

- `pnpm crawl` completes under the call budget and writes a snapshot
- The decision log shows the agent stopping on saturated creators and adding
  at least two creators that were not in the seed list
- The headline insight names real handles and contains a number
- The deployed page loads with data, no keys, no loading spinner over 2s
- Fixture mode runs the whole pipeline with zero network calls
