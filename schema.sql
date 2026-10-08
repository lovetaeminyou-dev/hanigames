CREATE TABLE IF NOT EXISTS rooms (
  room_code TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  host_id INTEGER NOT NULL,
  guest_id INTEGER,
  stake INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(host_id) REFERENCES users(id),
  FOREIGN KEY(guest_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_rooms_status_game ON rooms(status, game);


CREATE TABLE IF NOT EXISTS online_sessions (
  user_id INTEGER PRIMARY KEY,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_online_sessions_last_seen
ON online_sessions(last_seen);


CREATE TABLE IF NOT EXISTS attendance (
  user_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  streak INTEGER NOT NULL DEFAULT 1,
  reward INTEGER NOT NULL DEFAULT 300,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, attendance_date),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date
ON attendance(user_id, attendance_date);
