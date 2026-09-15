import type Database from "better-sqlite3";
import type { Post, ScraperAdapter } from "../../data/twitterapi";
import { readCache, writeCache } from "../../data/cache";

export interface FetchCreatorPostsInput {
  handle: string;
  platform: "x" | "linkedin";
  limit?: number;
}

export interface FetchCreatorPostsResult {
  cacheHit: boolean;
  postsReturned: number;
  posts: Post[];
  error?: string;
}

function upsertCreatorAndPosts(
  db: Database.Database,
  handle: string,
  posts: Post[],
  userId?: string
): void {
  const now = new Date().toISOString();

  // A creator who already showed up as someone else's engager has a
  // follower_count/bio on file -- reuse it instead of leaving it NULL.
  const known = db
    .prepare(`SELECT follower_count, bio FROM engagers WHERE handle = ? LIMIT 1`)
    .get(handle) as { follower_count: number; bio: string } | undefined;

  db.prepare(
    `INSERT INTO creators (handle, user_id, follower_count, bio, saturated, posts_fetched, added_by, added_at)
     VALUES (@handle, @userId, @followerCount, @bio, 0, 0, 'agent', @now)
     ON CONFLICT(handle) DO UPDATE SET
       user_id = COALESCE(@userId, creators.user_id),
       follower_count = COALESCE(@followerCount, creators.follower_count),
       bio = COALESCE(@bio, creators.bio)`
  ).run({
    handle,
    userId: userId ?? null,
    followerCount: known?.follower_count ?? null,
    bio: known?.bio ?? null,
    now,
  });

  const insertPost = db.prepare(
    `INSERT INTO posts (id, author_handle, text, media_urls, like_count, reply_count, retweet_count, created_at)
     VALUES (@id, @authorHandle, @text, @mediaUrls, @likeCount, @replyCount, @retweetCount, @createdAt)
     ON CONFLICT(id) DO UPDATE SET
       like_count = excluded.like_count,
       reply_count = excluded.reply_count,
       retweet_count = excluded.retweet_count`
  );
  const insertMany = db.transaction((rows: Post[]) => {
    for (const p of rows) {
      insertPost.run({
        id: p.id,
        authorHandle: p.authorHandle,
        text: p.text,
        mediaUrls: JSON.stringify(p.mediaUrls),
        likeCount: p.likeCount,
        replyCount: p.replyCount,
        retweetCount: p.retweetCount,
        createdAt: p.createdAt,
      });
    }
  });
  insertMany(posts);

  const { n } = db.prepare(`SELECT COUNT(*) as n FROM posts WHERE author_handle = ?`).get(handle) as { n: number };
  db.prepare(`UPDATE creators SET posts_fetched = ? WHERE handle = ?`).run(n, handle);
}

export async function fetchCreatorPosts(
  db: Database.Database,
  adapter: ScraperAdapter,
  input: FetchCreatorPostsInput
): Promise<FetchCreatorPostsResult> {
  const limit = input.limit ?? 15;
  const cacheKey = `${input.handle}-posts`;

  const cached = readCache<Post[]>(cacheKey);
  if (cached && cached.length >= limit) {
    const posts = cached.slice(0, limit);
    upsertCreatorAndPosts(db, input.handle, posts);
    return { cacheHit: true, postsReturned: posts.length, posts };
  }

  const resolved = await adapter.resolveHandle(input.handle);
  if (!resolved.exists) {
    return { cacheHit: false, postsReturned: 0, posts: [], error: `handle not found: ${input.handle}` };
  }

  const posts = await adapter.getUserPosts(input.handle, limit);
  writeCache(cacheKey, posts);
  upsertCreatorAndPosts(db, input.handle, posts, resolved.userId);

  return { cacheHit: false, postsReturned: posts.length, posts };
}
