import type Database from "better-sqlite3";
import type { Engagement } from "../../analysis/types";

/** Reads engagement rows out of SQLite in the shape the pure analysis functions expect. */
export function loadEngagements(db: Database.Database, creatorHandles?: string[]): Engagement[] {
  const rows = creatorHandles
    ? db
        .prepare(
          `SELECT engager_user_id, creator_handle, engagement_type
           FROM engagements
           WHERE creator_handle IN (${creatorHandles.map(() => "?").join(",")})`
        )
        .all(...creatorHandles)
    : db.prepare(`SELECT engager_user_id, creator_handle, engagement_type FROM engagements`).all();

  return (rows as { engager_user_id: string; creator_handle: string; engagement_type: string }[]).map((r) => ({
    engagerUserId: r.engager_user_id,
    creatorHandle: r.creator_handle,
    engagementType: r.engagement_type as Engagement["engagementType"],
  }));
}
