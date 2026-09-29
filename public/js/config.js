
    /* ==========================================================
       AUTOPILOT ARCADE ENGINE
       Single font monospace, minimalist light mode, opponent 57_Italian.
       ========================================================== */

    const OPPONENT_NAME = "57_Italian";

    const BACKEND_URL = 'http://localhost:3000/api/leaderboard';
    let isBackendOnline = false;

    // Shared world and vehicle tuning. A value of 1 uses the raw base value.
    const GAME_BALANCE = Object.freeze({
      // Multiplies every circuit coordinate. Larger = physically longer tracks.
      trackScale: 1.5,
      // Multiplies each circuit's authored road width. Larger = wider/easier roads.
      roadWidthScale: 1.4,
      // Multiplies the base top speed of 10.7. Larger = higher maximum speed.
      speedScale: 5,
      // Multiplies the base acceleration of 0.28. Larger = reaches top speed sooner.
      accelerationScale: 0.3,
      // Multiplies the base braking force of 0.45. Larger = shorter braking distance.
      brakingScale: 0.3,
      // Multiplies the base turn rate of 0.055. Larger = sharper/faster steering.
      steeringScale: 0.8
    });

    // C1 has no mechanical advantage: its pace comes entirely from its racing line.
    const C1_TUNING = Object.freeze({
      accelerationMultiplier: 1,
      brakingMultiplier: 1,
      steeringMultiplier: 1
    });
