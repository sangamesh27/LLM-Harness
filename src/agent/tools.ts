// Verbatim from docs/agent-config.md -- this is what actually gets sent to
// the Anthropic API as the `tools` array. Keep it in sync with that doc.
export const TOOLS = [
  {
    name: "fetch_creator_posts",
    description:
      "Fetch recent public posts for one creator handle on X or LinkedIn. Returns post id, text, media urls, engagement counts, and timestamp. Use this before fetching engagers.",
    input_schema: {
      type: "object",
      properties: {
        handle: {
          type: "string",
          description: "Creator handle without the @, e.g. 'levelsio'",
        },
        platform: {
          type: "string",
          enum: ["x", "linkedin"],
        },
        limit: {
          type: "integer",
          description:
            "How many recent posts to pull. Start at 15. Raise to 30 only if marginal unique reach is still above 5%.",
          default: 15,
        },
      },
      required: ["handle", "platform"],
    },
  },
  {
    name: "fetch_post_engagers",
    description:
      "Fetch the public engagers (repliers, quoters, commenters) on a set of posts. Returns handles, follower counts, and bios. This is the expensive call. Batch post ids rather than calling one at a time.",
    input_schema: {
      type: "object",
      properties: {
        post_ids: {
          type: "array",
          items: { type: "string" },
          description: "Up to 30 post ids in one call.",
        },
        platform: {
          type: "string",
          enum: ["x", "linkedin"],
        },
      },
      required: ["post_ids", "platform"],
    },
  },
  {
    name: "compute_overlap",
    description:
      "Compute the pairwise audience overlap matrix and the marginal unique reach for every creator currently in the pool. Call this after each creator is added to decide whether to keep expanding.",
    input_schema: {
      type: "object",
      properties: {
        creator_handles: {
          type: "array",
          items: { type: "string" },
          description: "Handles to include in the computation. Pass all creators fetched so far.",
        },
      },
      required: ["creator_handles"],
    },
  },
  {
    name: "classify_hook_style",
    description:
      "Send post media (video thumbnail or image) plus the first two lines of copy to a vision model and get back the hook style. Returns one of: talking_head, screen_recording, text_card, chart, meme, carousel, none. Use on each creator's top 3 posts by engagement.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string" },
        media_url: {
          type: "string",
          description: "Direct url to the image or video thumbnail.",
        },
        opening_lines: {
          type: "string",
          description: "First two lines of the post copy.",
        },
      },
      required: ["post_id", "opening_lines"],
    },
  },
  {
    name: "suggest_adjacent_creators",
    description:
      "Given the current engager pool, return handles who appear frequently as engagers, have over 5k followers, and are not yet in the creator set. Use this to expand rather than guessing names.",
    input_schema: {
      type: "object",
      properties: {
        min_appearances: {
          type: "integer",
          description: "Minimum number of distinct creators whose posts this person engaged with.",
          default: 3,
        },
        max_results: { type: "integer", default: 10 },
      },
      required: [],
    },
  },
  {
    name: "solve_minimum_set",
    description:
      "Run greedy set cover over the engager graph and return the smallest creator lineup covering the most unique reach, with the marginal gain of each addition. Call once, after expansion has stopped.",
    input_schema: {
      type: "object",
      properties: {
        target_coverage: {
          type: "number",
          description: "Fraction of total unique pool to cover, 0 to 1.",
          default: 0.8,
        },
      },
      required: [],
    },
  },
  {
    name: "emit_report",
    description: "Write the final report to Notion and the web view. Call exactly once, at the end.",
    input_schema: {
      type: "object",
      properties: {
        headline_insight: {
          type: "string",
          description:
            "One sentence a media buyer could act on today. Must contain a number. Not a summary of what you did.",
        },
        recommended_lineup: {
          type: "array",
          items: {
            type: "object",
            properties: {
              handle: { type: "string" },
              unique_reach: { type: "integer" },
              marginal_gain_pct: { type: "number" },
              hook_style: { type: "string" },
            },
            required: ["handle", "unique_reach", "marginal_gain_pct"],
          },
        },
        redundant_pairs: {
          type: "array",
          description: "Creator pairs sharing over 40% of audience. These are the ones worth cutting.",
          items: {
            type: "object",
            properties: {
              a: { type: "string" },
              b: { type: "string" },
              overlap_pct: { type: "number" },
            },
            required: ["a", "b", "overlap_pct"],
          },
        },
        hook_style_finding: {
          type: "string",
          description: "What the multi-modal pass revealed about format and overlap. One or two sentences.",
        },
        data_caveats: {
          type: "string",
          description: "What is partial, sampled, or unreliable. Be honest here.",
        },
      },
      required: ["headline_insight", "recommended_lineup", "redundant_pairs"],
    },
  },
] as const;
