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
