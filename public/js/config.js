
    /* ==========================================================
       AUTOPILOT ARCADE ENGINE
       Single font monospace, minimalist light mode, curvature AI C1.
       ========================================================== */

    const BACKEND_URL = 'http://localhost:3000/api/leaderboard';
    let isBackendOnline = false;

    // Shared tuning keeps player and C1 on the same, more forgiving pace.
    const GAME_BALANCE = Object.freeze({
      trackScale: 1.5,
      roadWidthScale: 1.4,
      speedScale: 0.6,
      steeringScale: 0.8
    });
