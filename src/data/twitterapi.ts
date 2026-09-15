import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

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

interface FixtureFile {
  handle: string;
  exists: boolean;
  userId?: string;
  posts?: Post[];
  engagersByPost?: Record<string, Omit<Engager, "engagedPostId">[]>;
}

const FIXTURES_DIR = path.join(process.cwd(), "fixtures");

/**
 * Reads recorded fixture files instead of calling twitterapi.io. Selected via
 * SCRAPER=fixtures (the default). Lets the whole pipeline run with zero
 * network calls and zero cost.
 */
export class FixtureAdapter implements ScraperAdapter {
  private files = new Map<string, FixtureFile>();
  private postIndex = new Map<string, { authorHandle: string; engagers: Omit<Engager, "engagedPostId">[] }>();

  constructor() {
    const names = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
    for (const name of names) {
      const raw = readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
      const file = JSON.parse(raw) as FixtureFile;
      this.files.set(file.handle, file);
      for (const post of file.posts ?? []) {
        this.postIndex.set(post.id, {
          authorHandle: file.handle,
          engagers: file.engagersByPost?.[post.id] ?? [],
        });
      }
    }
  }

  async resolveHandle(handle: string): Promise<{ exists: boolean; userId?: string }> {
    const file = this.files.get(handle);
    if (!file) return { exists: false };
    return { exists: file.exists, userId: file.userId };
  }

  async getUserPosts(handle: string, limit: number): Promise<Post[]> {
    const file = this.files.get(handle);
    if (!file || !file.exists) return [];
    return (file.posts ?? []).slice(0, limit);
  }

  async getPostEngagers(postIds: string[]): Promise<Engager[]> {
    const out: Engager[] = [];
    for (const postId of postIds) {
      const entry = this.postIndex.get(postId);
      if (!entry) continue;
      for (const e of entry.engagers) {
        out.push({ ...e, engagedPostId: postId });
      }
    }
    return out;
  }
}

/**
 * Selects the adapter based on SCRAPER=fixtures|live. Defaults to fixtures
 * so nothing ever hits the network (or costs money) by accident.
 */
export function createScraperAdapter(): ScraperAdapter {
  const mode = process.env.SCRAPER ?? "fixtures";
  if (mode === "fixtures") return new FixtureAdapter();
  throw new Error(
    "SCRAPER=live is not wired up yet. TwitterApiIoAdapter comes in the live-crawl step, once you have a twitterapi.io key."
  );
}
