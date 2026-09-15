import type Database from "better-sqlite3";
import type { Engager, ScraperAdapter } from "../../data/twitterapi";
import { hashKey, readCache, writeCache } from "../../data/cache";

const MAX_ENGAGERS_PER_POST = 100;

export interface FetchPostEngagersInput {
  post_ids: string[];
  platform: "x" | "linkedin";
}

export interface FetchPostEngagersResult {
  cacheHit: boolean;
  engagersWritten: number;
  partialPosts: string[]; // post ids truncated at MAX_ENGAGERS_PER_POST
  unknownPosts: string[]; // post ids with no local record (fetch_creator_posts wasn't called first)
}

export async function fetchPostEngagers(
  db: Database.Database,
  adapter: ScraperAdapter,
  input: FetchPostEngagersInput
): Promise<FetchPostEngagersResult> {
  const cacheKey = `engagers-${hashKey(input.post_ids)}`;

  let cacheHit = true;
  let engagers = readCache<Engager[]>(cacheKey);
  if (!engagers) {
    cacheHit = false;
    engagers = await adapter.getPostEngagers(input.post_ids);
    writeCache(cacheKey, engagers);
  }

  const byPost = new Map<string, Engager[]>();
  for (const e of engagers) {
    if (!byPost.has(e.engagedPostId)) byPost.set(e.engagedPostId, []);
    byPost.get(e.engagedPostId)!.push(e);
  }

  const partialPosts: string[] = [];
  const truncated: Engager[] = [];
  for (const [postId, list] of byPost) {
    if (list.length > MAX_ENGAGERS_PER_POST) {
      partialPosts.push(postId);
      truncated.push(...list.slice(0, MAX_ENGAGERS_PER_POST));
    } else {
      truncated.push(...list);
    }
  }

  const postRows = db
    .prepare(`SELECT id, author_handle FROM posts WHERE id IN (${input.post_ids.map(() => "?").join(",")})`)
    .all(...input.post_ids) as { id: string; author_handle: string }[];
  const authorOf = new Map(postRows.map((r) => [r.id, r.author_handle]));

  const knownPostIds = new Set(postRows.map((r) => r.id));
  const unknownPosts = input.post_ids.filter((id) => !knownPostIds.has(id));

  const upsertEngager = db.prepare(
    `INSERT INTO engagers (user_id, handle, follower_count, bio)
     VALUES (@userId, @handle, @followerCount, @bio)
     ON CONFLICT(user_id) DO UPDATE SET
       handle = excluded.handle,
       follower_count = excluded.follower_count,
       bio = excluded.bio`
  );
  const upsertEngagement = db.prepare(
    `INSERT OR IGNORE INTO engagements (engager_user_id, post_id, creator_handle, engagement_type)
     VALUES (@engagerUserId, @postId, @creatorHandle, @engagementType)`
  );

  let written = 0;
  const writeAll = db.transaction((records: Engager[]) => {
    for (const e of records) {
      const creatorHandle = authorOf.get(e.engagedPostId);
      if (!creatorHandle) continue;
      upsertEngager.run({ userId: e.userId, handle: e.handle, followerCount: e.followerCount, bio: e.bio });
      upsertEngagement.run({
        engagerUserId: e.userId,
        postId: e.engagedPostId,
        creatorHandle,
        engagementType: e.engagementType,
      });
      written++;
    }
  });
  writeAll(truncated);

  return { cacheHit, engagersWritten: written, partialPosts, unknownPosts };
}
