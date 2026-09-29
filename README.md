# Autopilot: Rally

A browser racing game for the university club: six circuits, keyboard/gamepad controls, and the autonomous C1 opponent.

Circuits are scaled to 150% of the original size with 140% road width. The player has 60% of the original top speed and acceleration, with gentler steering. C1 Expert uses distance-based pursuit and predictive braking, with the same top speed as the player, plus stronger acceleration, braking and steering. Physics runs at a fixed 60 updates per second regardless of display refresh rate. Player/track tuning and C1-specific performance multipliers live in `public/js/config.js`.

Press **Escape** or click **Pause [Esc]** during a race to pause. Use Escape or Resume Race to continue; End Race returns to circuit selection without saving an unfinished time. Switching tabs/windows also pauses the race. Paused time is excluded from race and lap clocks. Existing leaderboard records are retained; scores from the old balance are not directly comparable.

## Run locally

Install Node.js 24 or newer (`nvm use` if you use nvm), then run from this directory:

```sh
npm ci
npm start
```

Open **http://localhost:3000**. One server serves the game and its leaderboard API. The database and schema are created automatically on first start. There are no npm runtime dependencies. Stop with Ctrl+C. `node game.js` remains a compatibility launch command; use `npm start` to load optional `.env` settings.

```sh
npm test         # regression, API, database and browser-script smoke checks
npm run dev      # restart the backend when its source changes; refresh browser for frontend edits
```

## Controller menus

Use a browser-recognized standard gamepad. Press a button after connecting it so the browser exposes it to the game.

- D-pad or left stick: navigate menus (circuit previews update as you move).
- A / Cross: select the focused control.
- B / Circle: resume from pause, cancel a duplicate-name prompt, or return from results to the circuit menu.
- Start / Options: start the selected circuit, pause/resume a race, or retry from results.

Focused controls have a bold outline. Username entry still uses a keyboard. Held buttons do not repeatedly activate actions or carry a throttle press into the results menu. Disconnecting removes the controller highlight; keyboard and mouse remain available.

## Repository layout

```text
public/
  index.html                 Screen markup and ordered script loading
  css/game.css               Original stylesheet
  js/config.js               Original API URL and connection state
  js/tracks.js               Circuit data, spline generation and track state
  js/audio.js                Synthesized sound
  js/input.js                Keyboard and gamepad driving input
  js/controller-menu.js      Controller focus, menu navigation and pause controls
  js/vehicle.js              Vehicle physics, C1 driving and collisions
  js/race.js                 Race lifecycle, canvas rendering and HUD
  js/leaderboard.js          API client, local fallback and leaderboard rendering
  js/main.js                 UI events and initialization
server/
  index.js                   Process startup and shutdown
  config.js                  Environment configuration
  app.js                     HTTP API routing
  static.js                  Public asset serving
  services/leaderboard.js    Original ranking/update rules
  db/database.js             SQLite persistence and transactions
  db/migrations/             Versioned database schema
scripts/import-json.js       One-time legacy leaderboard import
tests/                       Automated regression checks
data/                        Local database; ignored by Git
docs/architecture.md         Preservation choices and operating limits
```

## Configuration

Defaults work without an `.env` file. To customize them, copy `.env.example` to `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Server listening interface |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `data/leaderboard.sqlite` | SQLite file, relative to repository root or absolute |

**Keep port 3000 for the unchanged game client.** Its original API address is `http://localhost:3000/api/leaderboard`. A different port only changes the server. This setup is for playing on the machine running the server. Hosting for remote players requires a deliberate follow-up change to client endpoint configuration and security, described in [architecture notes](docs/architecture.md).

## Database and existing scores

SQLite stores results on disk with atomic transactions and a versioned schema (`PRAGMA user_version`). The application uses Node's [built-in SQLite API](https://nodejs.org/api/sqlite.html). Node may display a SQLite stability warning depending on its version.

The leaderboard starts empty, matching the original server. Each circuit retains up to 50 entries, sorted by time; names match case-insensitively, and existing results update only when a faster time is submitted. Default bot entries remain exclusive to the unchanged browser's local-storage fallback.

If you have a `leaderboard.json` from the original server, stop the server and import it into an empty database:

```sh
npm run db:import -- /absolute/path/to/leaderboard.json
```

The import validates the basic record structure, runs atomically, leaves the source file untouched, and refuses to overwrite a nonempty database. No legacy data file was present in the supplied project. Browser local-storage records are not automatically uploaded.

To back up: stop the server cleanly, then copy the SQLite database to a safe location. To restore: stop the server, retain a backup of the current database, then replace it with the saved database. Do not copy only the main SQLite file while the server is running: active writes may be in its `-wal` file. Keep backups and database files out of Git.

## Contributing

Run `npm test` before committing. GitHub Actions runs the same suite on Node 24 and 26. Do not change frontend script order or add `async`/module loading casually: the extracted scripts retain their original shared scope. Frontend tests cover circuit initialization, speed tuning, pause/resume clocks, quitting, animation-loop cleanup, refresh-rate independence and C1 completing all circuits. Original source fingerprints are retained in `tests/original-hashes.json` as historical evidence of the initial extraction; they are no longer enforced now that gameplay changes are intentional. See [architecture notes](docs/architecture.md) for the tradeoff.

Git is initialized locally. No remote is configured and no code has been published.
