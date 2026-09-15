import type Database from "better-sqlite3";

export interface SuggestAdjacentCreatorsInput {
  min_appearances?: number;
  max_results?: number;
}

export interface AdjacentCandidate {
  handle: string;
  followerCount: number;
  bio: string;
  appearances: number;
}

export interface SuggestAdjacentCreatorsResult {
  candidates: AdjacentCandidate[];
}

export function suggestAdjacentCreators(
  db: Database.Database,
  input: SuggestAdjacentCreatorsInput
): SuggestAdjacentCreatorsResult {
  const minAppearances = input.min_appearances ?? 3;
  const maxResults = input.max_results ?? 10;

  // Only replies/quotes count as real signal -- retweets are noisy and cheap
  // to fake (BUILD.md), so a retweet-bot that hits every post shouldn't
  // outrank a person who actually replies across several creators.
  const rows = db
    .prepare(
      `SELECT en.handle AS handle, en.follower_count AS followerCount, en.bio AS bio,
              COUNT(DISTINCT e.creator_handle) AS appearances
       FROM engagements e
       JOIN engagers en ON en.user_id = e.engager_user_id
       WHERE en.follower_count > 5000
         AND e.engagement_type IN ('reply', 'quote')
         AND en.handle NOT IN (SELECT handle FROM creators)
       GROUP BY e.engager_user_id
       HAVING appearances >= @minAppearances
       ORDER BY appearances DESC, followerCount DESC
       LIMIT @maxResults`
    )
    .all({ minAppearances, maxResults }) as AdjacentCandidate[];

  return { candidates: rows };
}
