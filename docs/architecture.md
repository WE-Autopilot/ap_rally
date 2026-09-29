# Architecture and preservation boundary

The original project contained `index.html` (all UI, styles and browser logic) and `game.js` (a Node HTTP leaderboard server, despite its name). The restructuring separates those responsibilities and adds database persistence, repeatable startup, tests and CI.

## Browser preservation

The original inline script was divided at existing responsibility boundaries, without rewriting any of its contents. Concatenating the scripts in HTML loading order reproduces the original JavaScript byte for byte. CSS is also extracted verbatim; screen markup remains unchanged. SHA-256 fingerprints captured before extraction verify this in `tests/frontend.test.js`.

Scripts intentionally remain ordered classic scripts sharing one global lexical scope. Converting to ES modules, adding a framework, introducing a bundler or changing state ownership would be a separate refactor with a larger regression surface. The files are separated by responsibility, but their shared state is not yet encapsulated. No physics, AI, track geometry, audio, controls, timing or presentation changes were made.

The automated smoke test executes files separately in their actual load order with browser API stubs, exercises all six circuit previews and starts/advances a race on each. It is not a replacement for a complete human playthrough or hardware gamepad/audio testing.

## Backend contract

| Request | Existing contract retained |
| --- | --- |
| `GET /api/leaderboard?trackIndex=0` | Ordered array of entries, or `[]` |
| `GET /api/leaderboard` | Object keyed by circuit index |
| `POST /api/leaderboard` | `{trackIndex, name, time, gap?, date?}` → `{success: true, leaderboard}` |
| `OPTIONS` | 204, existing CORS headers |

Entries contain `name`, `time` in seconds, optional `gap` and `date`. The ranking service is moved directly from the original server: trim new names, compare case-insensitively using JavaScript `toLowerCase`, preserve the original display name on updates, accept only a faster time, stable-sort ties, retain 50 results per circuit. Missing dates use the server's current ISO timestamp.

Missing required fields still return 400; malformed JSON retains the original 500 response. No redesign of the existing validation or error contract was attempted. Infrastructure adds a 16 KiB body limit (413), safe public-directory static serving, database read-error handling, configurable startup and shutdown cleanup. SQLite's typed schema also rejects unsupported values instead of storing arbitrary JSON values in name/time columns. Those differences affect malformed requests, not the game-generated payloads.

## Persistence

`tracks` preserves circuit keys, including an empty imported circuit. `leaderboard_entries` stores circuit, position, name, numeric time, gap and date. Position preserves stable ordering across tied times. Optional gap/date fields are JSON-encoded in text columns to preserve the original distinction between absent fields and explicit JSON null values.

The database opens with foreign keys, WAL journaling and a busy timeout. Schema creation and version assignment are transactional. Each submission obtains a write transaction before reading, applies the original ranking algorithm, then stores the new state and commits. A failure rolls back the whole operation, including any deletion. Independent server processes using the same local database serialize these updates through SQLite's write lock.

For simplicity and parity with the original JSON backend, each update reads and rewrites the small leaderboard dataset within one transaction. For this six-circuit, 50-results-per-circuit game this keeps the existing business logic intact. If usage grows, replace this adapter with targeted per-circuit queries while retaining the regression suite. Store the database on a local persistent filesystem, not an ephemeral deployment filesystem or shared network drive.

Migration 001 creates the schema and records version 1. Future migrations must increment the version and run atomically. A database from a newer schema fails startup rather than silently opening with incompatible code. The legacy importer refuses to replace existing scores and never resets corrupt data to an empty leaderboard.

## Existing limitations deliberately retained

- The browser API endpoint and status text refer to localhost:3000. Merely binding the server to a network interface does not make remote leaderboard access work; each remote browser would contact its own localhost.
- Names are not authenticated identities. The “same player?” prompt does not establish ownership, and times are supplied by the client. The original wildcard CORS policy remains. Use this as a local club/kiosk game, not a public competitive scoring service.
- Local-storage fallback is separate from SQLite, does not synchronize automatically and does not cache successful server reads.
- The existing leaderboard renderer inserts `gap` into HTML. Game-generated gaps are controlled strings, but arbitrary API clients can submit unsafe values. Remote deployment needs validation/output escaping, authentication or an explicit trust model, abuse controls, HTTPS and configurable same-origin API routing. These are behavior/security changes outside the requested preservation pass.

The server defaults to loopback access. No hosting, remote account, credentials or external database service was introduced.
