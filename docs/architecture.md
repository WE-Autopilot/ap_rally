# Architecture and preservation boundary

The original project contained `index.html` (all UI, styles and browser logic) and `game.js` (a Node HTTP leaderboard server, despite its name). The restructuring separates those responsibilities and adds database persistence, repeatable startup, tests and CI.

## Browser preservation

The original inline script was divided at existing responsibility boundaries, without rewriting any of its contents during the initial repository cleanup. Original SHA-256 fingerprints are retained in `tests/original-hashes.json` as a historical baseline. The subsequent requested balancing and pause-menu work intentionally changes frontend behavior and replaces the fingerprint assertion with behavior tests.

Scripts intentionally remain ordered classic scripts sharing one global lexical scope. Converting to ES modules, adding a framework, introducing a bundler or changing state ownership would be a separate refactor with a larger regression surface. The files are separated by responsibility, but their shared state is not yet encapsulated. The initial cleanup did not change game behavior. The subsequent balancing pass scales track geometry/road width, reduces vehicle speed/acceleration/braking and steering, scales C1 braking thresholds, and uses a fixed 60 Hz simulation step so high-refresh screens do not accelerate gameplay.

The automated tests execute files separately in their actual load order with browser API stubs. They exercise all six previews and race starts, pause/resume timing, early exit, repeated starts, equivalent movement at 30/60/144 Hz, and C1 completing each enlarged circuit. It is not a replacement for a complete human playthrough or hardware gamepad/audio testing.

## C1 Expert controller

C1 follows a target interpolated along the spline at a distance measured in world units, instead of a fixed number of spline samples. Pure-pursuit steering translates heading error and speed into a turn command. A forward curvature scan estimates corner speed from steering capacity, then applies a braking-distance envelope before the turn. Throttle includes friction compensation so C1 maintains pace through straights and gentle bends. Large heading errors temporarily reduce target speed to recover after contact.

Both cars share the same top speed of 6.42 units/tick. AI-only tuning adds 35% acceleration, 50% braking and 65% steering authority relative to the player's balanced vehicle. It still uses vehicle physics, collisions and off-road penalties; it does not teleport or modify player results.

`tests/ai.test.js` checks pace, staying on-road and recovery from a 90-unit sideways displacement plus a 1.2-radian heading deflection on every circuit. The simulation helper executes the production controller and physics directly.

## Pause lifecycle

The race owns a single animation-frame handle. Pause cancels it, clears held keyboard input, silences the engine and opens a native modal dialog with contained keyboard focus. Resume shifts race and active lap start timestamps by the paused duration and resets the frame timestamp, preserving car state without simulating paused time. Escape, a visible Pause button, window blur and tab hiding can pause the race. Ending early cancels the loop, discards the pending submission and returns to the circuit menu.

Vehicle reset also clears its lap-crossing flag, preventing a restarted race from inheriting permission to cross the finish line. Existing leaderboard scores are not reset or rewritten by balancing; old and new lap times are not directly comparable.

## Controller menu input

`ControllerMenus` polls independently of the race animation so controls work on the title screen, in the pause dialog and after a race. It shares gamepad discovery with driving input and supports any populated controller slot. Standard-mapped button indices are used: A/Cross (0), B/Circle (1), Start/Options (9), D-pad (12–15).

Menu activation is edge-triggered. Directional input uses a 0.55 stick deadzone, a 350 ms initial repeat delay and 140 ms subsequent repeats. Polling observes button releases while racing or unfocused, preventing held throttle from activating a results button. Hidden/disabled controls are excluded; duplicate-name confirmation and the native pause dialog restrict navigation to their controls. Pointer or keyboard activity clears the controller focus outline. Browser focus loss still invokes the existing race pause behavior.

Tests supply synthetic gamepad snapshots to cover grid movement, repeating directions, starting/pausing/resuming/quitting, results actions, duplicate-name cancellation, held-button screen transitions, background windows and disconnected controllers. Physical-controller mappings and browser-specific gamepad permissions still require hardware testing.

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
