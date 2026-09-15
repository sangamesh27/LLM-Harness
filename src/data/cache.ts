import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".cache");

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function cachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}-${todayStamp()}.json`);
}

export function readCache<T>(key: string): T | undefined {
  const file = cachePath(key);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf-8")) as T;
}

export function writeCache<T>(key: string, data: T): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(key), JSON.stringify(data), "utf-8");
}

/** Order-independent cache key for a batch call, e.g. a list of post ids. */
export function hashKey(parts: string[]): string {
  return createHash("sha1").update([...parts].sort().join(",")).digest("hex").slice(0, 16);
}
