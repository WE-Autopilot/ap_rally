const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function openDatabase(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  try {
    transaction(() => {
      const version = db.prepare('PRAGMA user_version').get().user_version;
      if (version > 1) throw new Error('Database schema is newer than this application');
      if (version === 0) {
        db.exec(fs.readFileSync(path.join(__dirname, 'migrations/001-leaderboard.sql'), 'utf8'));
        db.exec('PRAGMA user_version = 1');
      }
    });
  } catch (error) {
    db.close();
    throw error;
  }
  const readTracks = db.prepare('SELECT track_key FROM tracks ORDER BY rowid');
  const readEntries = db.prepare('SELECT name, time, gap, date FROM leaderboard_entries WHERE track_key = ? ORDER BY position');
  const insertTrack = db.prepare('INSERT INTO tracks (track_key) VALUES (?)');
  const insertEntry = db.prepare('INSERT INTO leaderboard_entries VALUES (?, ?, ?, ?, ?, ?)');
  function readData() {
    const data = Object.create(null);
    for (const { track_key } of readTracks.all()) {
      data[track_key] = readEntries.all(track_key).map(row => {
        const entry = { name: row.name, time: row.time };
        if (row.gap !== null) entry.gap = JSON.parse(row.gap);
        if (row.date !== null) entry.date = JSON.parse(row.date);
        return entry;
      });
    }
    return data;
  }
  // Called only within a transaction. Keep original ordering, including tied times.
  function writeData(data) {
    db.exec('DELETE FROM tracks');
    for (const [key, entries] of Object.entries(data)) {
      insertTrack.run(key);
      entries.forEach((entry, position) => insertEntry.run(
        key, position, entry.name, entry.time,
        entry.gap === undefined ? null : JSON.stringify(entry.gap),
        entry.date === undefined ? null : JSON.stringify(entry.date)
      ));
    }
  }
  return {
    readData: () => transaction(readData),
    update(work) {
      return transaction(() => {
        const data = readData();
        const result = work(data);
        writeData(data);
        return result;
      });
    },
    close: () => db.close()
  };
}
module.exports = { openDatabase };
