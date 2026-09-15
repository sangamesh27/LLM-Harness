CREATE TABLE creators (
  handle TEXT PRIMARY KEY,
  user_id TEXT,
  follower_count INTEGER,
  bio TEXT,
  cluster_hint TEXT,          -- from seeds, NEVER shown to the agent
  saturated INTEGER DEFAULT 0,
  posts_fetched INTEGER DEFAULT 0,
  added_by TEXT,              -- 'seed' or 'agent'
  added_at TEXT
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_handle TEXT NOT NULL,
  text TEXT,
  media_urls TEXT,            -- JSON array
  like_count INTEGER,
  reply_count INTEGER,
  retweet_count INTEGER,
  created_at TEXT,
  hook_style TEXT,            -- filled by the vision pass
  FOREIGN KEY (author_handle) REFERENCES creators(handle)
);

CREATE TABLE engagers (
  user_id TEXT PRIMARY KEY,
  handle TEXT,
  follower_count INTEGER,
  bio TEXT
);

CREATE TABLE engagements (
  engager_user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  creator_handle TEXT NOT NULL,
  engagement_type TEXT,
  PRIMARY KEY (engager_user_id, post_id)
);

CREATE INDEX idx_eng_creator ON engagements(creator_handle);
CREATE INDEX idx_eng_user ON engagements(engager_user_id);

CREATE TABLE agent_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  reasoning TEXT,             -- the agent's one-line why
  tool_name TEXT,
  tool_input TEXT,
  result_summary TEXT,
  created_at TEXT
);
