CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

INSERT INTO settings (key, value) VALUES ('selected_circuit', '0');
