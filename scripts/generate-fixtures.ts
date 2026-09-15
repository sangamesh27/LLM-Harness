// Builds synthetic "recorded API responses" under /fixtures so the whole
// pipeline can run with SCRAPER=fixtures — zero network calls, zero cost.
//
// The overlap structure is deliberate, not random noise:
//  - each category has a CORE POOL of fake engagers shared by every creator
//    in that category -> high overlap between same-category creators.
//  - adjacent categories share a smaller BRIDGE POOL -> a little real
//    cross-category overlap, the kind suggest_adjacent_creators should find.
//  - a CANDIDATE POOL of people who are NOT seed creators but show up
//    repeatedly as engagers with >5k followers -> what the agent should
//    discover and propose adding.
//  - a CELEBRITY POOL of huge accounts that retweet everything -> noise,
//    mirrors the brief's warning that retweets are "noisy and cheap to fake".
//
// Re-running this script regenerates every fixture from the fixed seed
// below, so output is reproducible.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mulberry32, randInt, pick } from "../src/data/fixtureGen/rng.ts";
import type { Post } from "../src/data/twitterapi.ts";

const SEED = 42;
const rng = mulberry32(SEED);

const FIXTURES_DIR = path.join(process.cwd(), "fixtures");
if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Seed data (category -> handles), read from config/seeds.json.
// ---------------------------------------------------------------------------

const seedsRaw = JSON.parse(
  readFileSync(path.join(process.cwd(), "config/seeds.json"), "utf-8")
) as Record<string, { handle: string; confidence: string }[]>;

const categories = Object.keys(seedsRaw);

// Two handles deliberately marked dead, to exercise the resolveHandle
// verification pass (BUILD.md build order, step 2). Both are the "low
// confidence" entries in seeds.json — the honest confidence notes paid off.
const DEAD_HANDLES = new Set(["retentionadam", "marc_louvion"]);

// ---------------------------------------------------------------------------
// Bridges between adjacent categories (drives suggest_adjacent_creators).
// ---------------------------------------------------------------------------

const BRIDGES: [string, string][] = [
  ["gtm_marketing", "sales"],
  ["product_growth", "indie"],
  ["devtools", "ai"],
  ["product_growth", "devtools"],
];

// ---------------------------------------------------------------------------
// Fake identity generator.
// ---------------------------------------------------------------------------

let userIdCounter = 1;
const HANDLE_A = ["build", "growth", "launch", "ship", "scale", "found", "market", "code", "data", "design", "stack", "loop", "signal", "seed", "rev", "indie", "solo", "async", "north", "open"];
const HANDLE_B = ["wave", "hacker", ".ops", "labs", "forge", "works", "hub", "dev", "craft", "stream", "node", "edge", "pilot", "flow", "path", "gg", "hq", "co", "io", "atx"];

function genHandle(): string {
  const h = `${pick(rng, HANDLE_A)}${pick(rng, HANDLE_B)}${rng() < 0.3 ? randInt(rng, 1, 99) : ""}`;
  return h.replace(/[^a-z0-9_]/gi, "");
}

const BIO_BY_CATEGORY: Record<string, string[]> = {
  gtm_marketing: ["GTM strategy | positioning nerd", "B2B marketing, occasionally useful", "messaging > tactics"],
  sales: ["Enterprise sales | pipeline over vibes", "SDR to AE, sharing what worked", "closing deals, not lying about it"],
  product_growth: ["Growth loops and PLG", "Product-led growth, ex-startup", "curious about retention curves"],
  indie: ["Building in public, solo founder", "indie hacker, bootstrapped", "shipping side projects"],
  devtools: ["Building developer tools", "OSS maintainer, frontend infra", "dev experience is the product"],
  ai: ["Building with LLMs", "AI tooling, prompt-pipeline tinkerer", "agents and evals"],
  bridge: ["wears two hats", "GTM + product, depends on the day"],
  candidate: ["quietly building something", "lurker who occasionally posts good takes"],
  celebrity: ["Startup news, retweets everything", "viral takes account"],
};

function genPerson(category: string, followerRange: [number, number]) {
  const bios = BIO_BY_CATEGORY[category] ?? BIO_BY_CATEGORY.candidate;
  return {
    handle: genHandle(),
    userId: `u_${userIdCounter++}`,
    followerCount: randInt(rng, followerRange[0], followerRange[1]),
    bio: pick(rng, bios),
  };
}

// ---------------------------------------------------------------------------
// Build the pools.
// ---------------------------------------------------------------------------

type Person = { handle: string; userId: string; followerCount: number; bio: string };

const corePool = new Map<string, Person[]>();
for (const cat of categories) {
  corePool.set(cat, Array.from({ length: 22 }, () => genPerson(cat, [500, 15000])));
}

const bridgePool = new Map<string, Person[]>();
for (const [a, b] of BRIDGES) {
  bridgePool.set(`${a}|${b}`, Array.from({ length: 10 }, () => genPerson("bridge", [2000, 20000])));
}
function bridgesFor(cat: string): Person[] {
  const out: Person[] = [];
  for (const [a, b] of BRIDGES) {
    if (a === cat || b === cat) out.push(...bridgePool.get(`${a}|${b}`)!);
  }
  return out;
}

// Candidate creators: not seeds, but should surface via suggest_adjacent_creators.
// Each is tied to the categories whose posts they show up engaging with.
const CANDIDATES: { handle: string; categories: string[] }[] = [
  { handle: "packyops", categories: ["product_growth", "indie"] },
  { handle: "buildwithkay", categories: ["devtools", "ai"] },
  { handle: "growthloopz", categories: ["gtm_marketing", "sales"] },
  { handle: "solofounder_max", categories: ["indie"] },
  { handle: "datadrivendana", categories: ["product_growth", "devtools"] },
];
const candidatePeople = new Map(
  CANDIDATES.map((c) => [c.handle, { handle: c.handle, userId: `u_${userIdCounter++}`, followerCount: randInt(rng, 8000, 150000), bio: pick(rng, BIO_BY_CATEGORY.candidate) } as Person])
);
function candidatesFor(cat: string): Person[] {
  return CANDIDATES.filter((c) => c.categories.includes(cat)).map((c) => candidatePeople.get(c.handle)!);
}

const celebrityPool: Person[] = Array.from({ length: 4 }, () => genPerson("celebrity", [200000, 2000000]));

// ---------------------------------------------------------------------------
// Per-creator: unique long-tail engagers (never shared with anyone else).
// ---------------------------------------------------------------------------

function genUniquePool(cat: string, size: number): Person[] {
  return Array.from({ length: size }, () => genPerson(cat, [200, 5000]));
}

// ---------------------------------------------------------------------------
// Post + engagement generation for one creator.
// ---------------------------------------------------------------------------

const POST_TOPICS = [
  "Why most {topic} advice is wrong",
  "What I learned shipping {topic} for a year",
  "A framework for thinking about {topic}",
  "The {topic} mistake everyone makes early",
  "Unpopular opinion about {topic}",
  "How we 2x'd {topic} in a quarter",
  "A thread on {topic}, saved you the read",
  "Stop doing {topic} like this",
];
const TOPIC_WORDS: Record<string, string[]> = {
  gtm_marketing: ["positioning", "messaging", "launches", "GTM motion"],
  sales: ["cold outbound", "pipeline", "discovery calls", "closing"],
  product_growth: ["retention", "activation", "growth loops", "onboarding"],
  indie: ["solo building", "pricing", "distribution", "shipping fast"],
  devtools: ["developer experience", "API design", "OSS maintenance", "build tooling"],
  ai: ["prompt design", "agent evals", "context windows", "tool use"],
};

// Real local PNGs (generate them first with `npm run fixtures:media`) --
// relative paths, not URLs, so the vision pass reads them straight off disk
// instead of hitting a dead "fixture.local" domain.
const MEDIA_FILES = ["fixtures/media/chart.png", "fixtures/media/textcard.png", "fixtures/media/photo.png"];

function genPosts(handle: string, category: string, count: number): Post[] {
  const topics = TOPIC_WORDS[category] ?? TOPIC_WORDS.indie;
  const posts: Post[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = randInt(rng, 1, 60);
    const created = new Date(Date.UTC(2026, 8, 15));
    created.setUTCDate(created.getUTCDate() - daysAgo);
    const hasMedia = rng() < 0.4;
    posts.push({
      id: `${handle}_p${i}`,
      authorHandle: handle,
      text: pick(rng, POST_TOPICS).replace("{topic}", pick(rng, topics)),
      mediaUrls: hasMedia ? [pick(rng, MEDIA_FILES)] : [],
      likeCount: 0,
      replyCount: 0,
      retweetCount: 0,
      createdAt: created.toISOString(),
    });
  }
  return posts;
}

type EngagerRecord = { handle: string; userId: string; followerCount: number; bio: string; engagementType: "reply" | "quote" | "retweet" };

function weightedPerson(pools: { list: Person[]; weight: number }[]): Person {
  const total = pools.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (const p of pools) {
    if (r < p.weight) return pick(rng, p.list.length ? p.list : celebrityPool);
    r -= p.weight;
  }
  return pick(rng, celebrityPool);
}

function genCreatorFixture(handle: string, category: string, postCount: number) {
  const unique = genUniquePool(category, 12);
  const core = corePool.get(category) ?? [];
  const bridge = bridgesFor(category);
  const candidates = candidatesFor(category);

  const posts = genPosts(handle, category, postCount);
  const engagersByPost: Record<string, EngagerRecord[]> = {};

  for (const post of posts) {
    const records: EngagerRecord[] = [];

    const replyCount = randInt(rng, 3, 14);
    for (let i = 0; i < replyCount; i++) {
      const person = weightedPerson([
        { list: core, weight: 60 },
        { list: bridge, weight: bridge.length ? 20 : 0 },
        { list: unique, weight: 15 },
        { list: candidates, weight: candidates.length ? 5 : 0 },
      ]);
      records.push({ ...person, engagementType: "reply" });
    }

    const quoteCount = randInt(rng, 0, 4);
    for (let i = 0; i < quoteCount; i++) {
      const person = weightedPerson([
        { list: core, weight: 70 },
        { list: bridge, weight: bridge.length ? 30 : 0 },
      ]);
      records.push({ ...person, engagementType: "quote" });
    }

    const retweetCount = randInt(rng, 4, 20);
    for (let i = 0; i < retweetCount; i++) {
      const person = weightedPerson([
        { list: celebrityPool, weight: 55 },
        { list: core, weight: 30 },
        { list: unique, weight: 15 },
      ]);
      records.push({ ...person, engagementType: "retweet" });
    }

    engagersByPost[post.id] = records;
    post.replyCount = replyCount;
    post.retweetCount = retweetCount;
    post.likeCount = randInt(rng, replyCount * 3, replyCount * 12 + 20);
  }

  return { handle, exists: true, userId: `u_creator_${handle}`, posts, engagersByPost };
}

// ---------------------------------------------------------------------------
// Write one fixture file per handle.
// ---------------------------------------------------------------------------

let written = 0;

for (const [category, entries] of Object.entries(seedsRaw)) {
  for (const { handle } of entries) {
    if (DEAD_HANDLES.has(handle)) {
      writeFileSync(path.join(FIXTURES_DIR, `${handle}.json`), JSON.stringify({ handle, exists: false }, null, 2));
      written++;
      continue;
    }
    const fixture = genCreatorFixture(handle, category, 12);
    writeFileSync(path.join(FIXTURES_DIR, `${handle}.json`), JSON.stringify(fixture, null, 2));
    written++;
  }
}

for (const { handle, categories: cats } of CANDIDATES) {
  const fixture = genCreatorFixture(handle, cats[0], 8);
  writeFileSync(path.join(FIXTURES_DIR, `${handle}.json`), JSON.stringify(fixture, null, 2));
  written++;
}

console.log(`Wrote ${written} fixture files to ${FIXTURES_DIR}`);
console.log(`Dead handles (resolveHandle should report these as missing): ${[...DEAD_HANDLES].join(", ")}`);
console.log(`Candidate creators the agent should be able to discover: ${CANDIDATES.map((c) => c.handle).join(", ")}`);
