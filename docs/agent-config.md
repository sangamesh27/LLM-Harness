# Creator Overlap Mapper, agent config

Drop-in tool definitions and system prompt for the Anthropic Messages API with tool use.

---

## System prompt

```
You are the research loop inside a creator audience overlap mapper.

GOAL
Find the smallest set of B2B creators on X and LinkedIn that reaches the
largest number of DISTINCT engaged people. Overlap is the enemy. Raw
follower count is noise.

WHAT YOU CONTROL
You decide which creators to fetch, how many of their posts to pull, when
a creator has enough data, whether to expand into adjacent creators, and
when to stop. Nobody is sequencing these calls for you.

METHOD
1. Start from the seed creators given to you.
2. For each, fetch recent public posts, then fetch the engagers on those posts.
3. Track marginal unique reach: how many NEW people each additional creator
   or each additional batch of posts adds to the pool.
4. When a creator's marginal unique reach per new post drops below 5%, that
   creator is saturated. Stop fetching them.
5. When you spot a creator who appears repeatedly as an engager on other
   creators' posts and is not yet in the set, add them as a candidate.
6. Classify the hook style of each creator's top posts using the vision tool.
7. Stop when either: 25 creators are saturated, or the last 3 creators added
   under 3% unique reach each.

BUDGET
You have a hard cap of 120 tool calls. Spend them on breadth first, depth
second. A shallow read of 20 creators beats a deep read of 4.

DECISION LOGGING
Before each tool call, state in one line why you are making it and what you
expect to learn. These lines become the audit trail shown in the UI.

WHAT NOT TO DO
- Never fetch anything requiring authentication beyond public post data.
- Never guess engager identities. If the scraper returns partial data, mark
  it partial and move on.
- Never pad the creator set to hit a round number.

OUTPUT
When done, call emit_report exactly once.
```

---

## Tool definitions

```json
[
  {
    "name": "fetch_creator_posts",
    "description": "Fetch recent public posts for one creator handle on X or LinkedIn. Returns post id, text, media urls, engagement counts, and timestamp. Use this before fetching engagers.",
    "input_schema": {
      "type": "object",
      "properties": {
        "handle": {
          "type": "string",
          "description": "Creator handle without the @, e.g. 'levelsio'"
        },
        "platform": {
          "type": "string",
          "enum": ["x", "linkedin"]
        },
        "limit": {
          "type": "integer",
          "description": "How many recent posts to pull. Start at 15. Raise to 30 only if marginal unique reach is still above 5%.",
          "default": 15
        }
      },
      "required": ["handle", "platform"]
    }
  },
  {
    "name": "fetch_post_engagers",
    "description": "Fetch the public engagers (repliers, quoters, commenters) on a set of posts. Returns handles, follower counts, and bios. This is the expensive call. Batch post ids rather than calling one at a time.",
    "input_schema": {
      "type": "object",
      "properties": {
        "post_ids": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Up to 30 post ids in one call."
        },
        "platform": {
          "type": "string",
          "enum": ["x", "linkedin"]
        }
      },
      "required": ["post_ids", "platform"]
    }
  },
  {
    "name": "compute_overlap",
    "description": "Compute the pairwise audience overlap matrix and the marginal unique reach for every creator currently in the pool. Call this after each creator is added to decide whether to keep expanding.",
    "input_schema": {
      "type": "object",
      "properties": {
        "creator_handles": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Handles to include in the computation. Pass all creators fetched so far."
        }
      },
      "required": ["creator_handles"]
    }
  },
  {
    "name": "classify_hook_style",
    "description": "Send post media (video thumbnail or image) plus the first two lines of copy to a vision model and get back the hook style. Returns one of: talking_head, screen_recording, text_card, chart, meme, carousel, none. Use on each creator's top 3 posts by engagement.",
    "input_schema": {
      "type": "object",
      "properties": {
        "post_id": { "type": "string" },
        "media_url": {
          "type": "string",
          "description": "Direct url to the image or video thumbnail."
        },
        "opening_lines": {
          "type": "string",
          "description": "First two lines of the post copy."
        }
      },
      "required": ["post_id", "opening_lines"]
    }
  },
  {
    "name": "suggest_adjacent_creators",
    "description": "Given the current engager pool, return handles who appear frequently as engagers, have over 5k followers, and are not yet in the creator set. Use this to expand rather than guessing names.",
    "input_schema": {
      "type": "object",
      "properties": {
        "min_appearances": {
          "type": "integer",
          "description": "Minimum number of distinct creators whose posts this person engaged with.",
          "default": 3
        },
        "max_results": { "type": "integer", "default": 10 }
      },
      "required": []
    }
  },
  {
    "name": "solve_minimum_set",
    "description": "Run greedy set cover over the engager graph and return the smallest creator lineup covering the most unique reach, with the marginal gain of each addition. Call once, after expansion has stopped.",
    "input_schema": {
      "type": "object",
      "properties": {
        "target_coverage": {
          "type": "number",
          "description": "Fraction of total unique pool to cover, 0 to 1.",
          "default": 0.8
        }
      },
      "required": []
    }
  },
  {
    "name": "emit_report",
    "description": "Write the final report to Notion and the web view. Call exactly once, at the end.",
    "input_schema": {
      "type": "object",
      "properties": {
        "headline_insight": {
          "type": "string",
          "description": "One sentence a media buyer could act on today. Must contain a number. Not a summary of what you did."
        },
        "recommended_lineup": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "handle": { "type": "string" },
              "unique_reach": { "type": "integer" },
              "marginal_gain_pct": { "type": "number" },
              "hook_style": { "type": "string" }
            },
            "required": ["handle", "unique_reach", "marginal_gain_pct"]
          }
        },
        "redundant_pairs": {
          "type": "array",
          "description": "Creator pairs sharing over 40% of audience. These are the ones worth cutting.",
          "items": {
            "type": "object",
            "properties": {
              "a": { "type": "string" },
              "b": { "type": "string" },
              "overlap_pct": { "type": "number" }
            },
            "required": ["a", "b", "overlap_pct"]
          }
        },
        "hook_style_finding": {
          "type": "string",
          "description": "What the multi-modal pass revealed about format and overlap. One or two sentences."
        },
        "data_caveats": {
          "type": "string",
          "description": "What is partial, sampled, or unreliable. Be honest here."
        }
      },
      "required": ["headline_insight", "recommended_lineup", "redundant_pairs"]
    }
  }
]
```

---

## Loop skeleton

```javascript
const messages = [{
  role: "user",
  content: `Seed creators: ${seedList.join(", ")}. Platform priority: X first,
LinkedIn second. Begin.`
}];

let calls = 0;
const MAX_CALLS = 120;

while (calls < MAX_CALLS) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages
    })
  });

  const data = await res.json();
  messages.push({ role: "assistant", content: data.content });

  const toolUses = data.content.filter(b => b.type === "tool_use");
  if (toolUses.length === 0) break;

  const results = [];
  for (const use of toolUses) {
    calls++;
    if (use.name === "emit_report") {
      await writeReport(use.input);
      return use.input;
    }
    const out = await runTool(use.name, use.input);
    results.push({
      type: "tool_result",
      tool_use_id: use.id,
      content: JSON.stringify(out)
    });
  }

  messages.push({ role: "user", content: results });
}
```

---

## Three things that make or break the demo

1. **Cache every scraper response to disk, keyed by handle and date.** Re-running the loop during development without a cache will burn your Apify credits in an hour.

2. **Log the agent's one-line reasoning before each call and show it in the UI.** This is the single clearest proof that it is a harness and not a script. Without it, the demo looks like any other dashboard.

3. **The `headline_insight` must contain a number and name real handles.** If it comes back as "there is significant overlap among B2B creators", the whole build reads as generic. Force the number in the schema description and reject vague output in post-processing.
