const fs = require('node:fs');
const path = require('node:path');
const config = require('../server/config');
const { openDatabase } = require('../server/db/database');

// Import once into an empty database; never overwrite existing race results.
const source = process.argv[2];
if (!source) {
  console.error('Usage: npm run db:import -- /path/to/leaderboard.json');
  process.exitCode = 1;
} else {
  let database;
  try {
    const data = JSON.parse(fs.readFileSync(path.resolve(source), 'utf8'));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Expected an object keyed by circuit index');
    for (const [key, entries] of Object.entries(data)) {
      if (!Array.isArray(entries) || entries.length > 50) throw new Error(`Invalid leaderboard for circuit ${key}`);
      for (const entry of entries) {
        if (!entry || typeof entry.name !== 'string' || !Number.isFinite(entry.time)) throw new Error(`Invalid entry for circuit ${key}`);
      }
    }
    database = openDatabase(config.databasePath);
    database.update(current => {
      if (Object.keys(current).length) throw new Error('Destination database is not empty; import refused');
      Object.assign(current, data);
    });
    console.log(`Imported ${Object.keys(data).length} circuits into ${config.databasePath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    database?.close();
  }
}
