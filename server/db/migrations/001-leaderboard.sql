CREATE TABLE tracks (
  track_key TEXT PRIMARY KEY
) STRICT;

CREATE TABLE leaderboard_entries (
  track_key TEXT NOT NULL REFERENCES tracks(track_key) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 50),
  name TEXT NOT NULL,
  time REAL NOT NULL,
  gap TEXT,
  date TEXT,
  PRIMARY KEY (track_key, position)
) STRICT;
