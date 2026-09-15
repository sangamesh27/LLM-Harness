export type EngagementType = "reply" | "quote" | "retweet";

export interface Engagement {
  engagerUserId: string;
  creatorHandle: string;
  engagementType: EngagementType;
}
