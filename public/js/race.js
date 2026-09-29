    /* ==========================================================
       GAME LIFECYCLE & RENDERING
       ========================================================== */

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const previewCanvas = document.getElementById('previewCanvas');
    const pctx = previewCanvas.getContext('2d');

    const player = new Vehicle(false, "P1", "#111111");
    const botC1 = new Vehicle(true, OPPONENT_NAME, "#555555");

    let isGameRunning = false;
    let isGamePaused = false;
    let pauseStartedAt = 0;
    let animationFrameId = null;
    let lastFrameTime = 0;
    let physicsAccumulator = 0;
    const PHYSICS_STEP_MS = 1000 / 60;
    const CAMERA_ZOOM_MAX = 1.28;
    const CAMERA_ZOOM_MIN = 0.72;
    const CAMERA_ZOOM_RESPONSE = 0.055;
    let cameraZoom = CAMERA_ZOOM_MAX;

    function updateCameraZoom() {
      const speedRatio = Math.min(1, Math.abs(player.speed) / Math.max(player.maxSpeed, 0.001));
      // Smoothstep keeps low-speed framing steady and widens naturally near top speed.
      const zoomProgress = speedRatio * speedRatio * (3 - 2 * speedRatio);
      const targetZoom = CAMERA_ZOOM_MAX + (CAMERA_ZOOM_MIN - CAMERA_ZOOM_MAX) * zoomProgress;
      cameraZoom += (targetZoom - cameraZoom) * CAMERA_ZOOM_RESPONSE;
    }
    let raceClockStart = 0;
    let pendingPlayerEntry = null;
    let bestGhost = [];
    let bestGhostTime = 0;
    let ghostRecording = [];
    let lastGhostSampleTime = -Infinity;
    let ghostPlaybackIndex = 0;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', () => {
      resizeCanvas();
      drawPreview(currentTrackIdx);
    });
    resizeCanvas();

    function drawPreview(trackIndex) {
      const res = generateSpline(CIRCUITS[trackIndex].nodes, 20);
      const pts = res.points;
      const w = previewCanvas.width;
      const h = previewCanvas.height;

      pctx.fillStyle = '#fafafa';
      pctx.fillRect(0, 0, w, h);

      if (!pts.length) return;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });

      const pad = 24;
      const scaleX = (w - pad * 2) / (maxX - minX);
      const scaleY = (h - pad * 2) / (maxY - minY);
      const scale = Math.min(scaleX, scaleY);
      const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
      const oy = (h - (maxY - minY) * scale) / 2 - minY * scale;

      // Track outline
      pctx.beginPath();
      pctx.lineWidth = 14;
      pctx.strokeStyle = '#dddddd';
      pts.forEach((p, idx) => {
        const sx = p.x * scale + ox;
        const sy = p.y * scale + oy;
        if (idx === 0) pctx.moveTo(sx, sy);
        else pctx.lineTo(sx, sy);
      });
      pctx.closePath();
      pctx.stroke();

      // Centerline
      pctx.beginPath();
      pctx.lineWidth = 1.5;
      pctx.strokeStyle = '#111111';
      pts.forEach((p, idx) => {
        const sx = p.x * scale + ox;
        const sy = p.y * scale + oy;
        if (idx === 0) pctx.moveTo(sx, sy);
        else pctx.lineTo(sx, sy);
      });
      pctx.closePath();
      pctx.stroke();

      // Start line mark
      const startP = pts[0];
      pctx.fillStyle = '#111111';
      pctx.beginPath();
      pctx.arc(startP.x * scale + ox, startP.y * scale + oy, 4, 0, Math.PI * 2);
      pctx.fill();

      document.getElementById('previewMeta').innerText =
        `${CIRCUITS[trackIndex].name.toUpperCase()} | ${CIRCUITS[trackIndex].nodes.length} TURNS | ${CIRCUITS[trackIndex].laps} LAPS`;
    }

    function switchScreen(screenId) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById(screenId).classList.add('active');
    }

    function startRace() {
      cancelAnimationFrame(animationFrameId);
      document.getElementById('pauseMenu').close();
      isGamePaused = false;
      pendingPlayerEntry = null;
      ghostRecording = [];
      lastGhostSampleTime = -Infinity;
      ghostPlaybackIndex = 0;
      input.keys = {};
      initTrack(currentTrackIdx);
      const startP = trackSpline[0];
      const nextP = trackSpline[2];
      const initAngle = Math.atan2(nextP.y - startP.y, nextP.x - startP.x);

      // Normal offset for grid positions
      const nx = -Math.sin(initAngle);
      const ny = Math.cos(initAngle);

      player.reset();
      player.x = startP.x + nx * 14;
      player.y = startP.y + ny * 14;
      player.angle = initAngle;

      botC1.reset();
      botC1.x = startP.x - nx * 14 - Math.cos(initAngle) * 20;
      botC1.y = startP.y - ny * 14 - Math.sin(initAngle) * 20;
      botC1.angle = initAngle;

      raceClockStart = performance.now();
      lastFrameTime = raceClockStart;
      physicsAccumulator = 0;
      cameraZoom = CAMERA_ZOOM_MAX;
      player.lapStartTime = raceClockStart;
      botC1.lapStartTime = raceClockStart;

      document.getElementById('hudTrack').innerText = CIRCUITS[currentTrackIdx].name;
      document.getElementById('hudBest').innerText = '--:--.---';
      document.getElementById('hudTime').innerText = '00:00.000';
      document.getElementById('hudLap').innerText = `1 / ${CIRCUITS[currentTrackIdx].laps}`;
      document.getElementById('hudSpeed').innerText = '0 KM/H';
      document.getElementById('hudHandling').innerText = 'GRIP';
      switchScreen('gameScreen');
      isGameRunning = true;
      audio.init();
      animationFrameId = requestAnimationFrame(gameLoop);
    }

    function pauseRace() {
      if (!isGameRunning || isGamePaused) return;
      isGamePaused = true;
      pauseStartedAt = performance.now();
      cancelAnimationFrame(animationFrameId);
      input.keys = {};
      audio.stopEngine();
      setPauseControls(false);
      document.getElementById('pauseMenu').showModal();
    }

    function setPauseControls(visible) {
      document.getElementById('pauseActions').hidden = visible;
      document.getElementById('pauseControls').hidden = !visible;
      document.getElementById('pauseTitle').textContent = visible ? 'CONTROLS' : 'RACE PAUSED';
      document.getElementById('pauseDescription').textContent = visible
        ? 'Keyboard and controller reference. The race remains paused.'
        : 'Take a breather. The cars and race clock are paused.';
    }

    function showPauseControls() {
      if (!isGamePaused) return;
      setPauseControls(true);
      document.getElementById('btnControlsBack').focus();
    }

    function backFromPauseMenu() {
      if (!isGamePaused) return;
      if (!document.getElementById('pauseControls').hidden) {
        setPauseControls(false);
        document.getElementById('btnShowControls').focus();
      } else {
        resumeRace();
      }
    }

    function resumeRace() {
      if (!isGameRunning || !isGamePaused) return;
      const now = performance.now();
      const pausedDuration = now - pauseStartedAt;
      raceClockStart += pausedDuration;
      for (const car of [player, botC1]) {
        if (!car.raceFinished) car.lapStartTime += pausedDuration;
      }
      lastFrameTime = now;
      isGamePaused = false;
      input.keys = {};
      document.getElementById('pauseMenu').close();
      animationFrameId = requestAnimationFrame(gameLoop);
    }

    function quitRace() {
      if (!isGameRunning) return;
      cancelAnimationFrame(animationFrameId);
      isGameRunning = false;
      isGamePaused = false;
      pendingPlayerEntry = null;
      input.keys = {};
      audio.stopEngine();
      document.getElementById('pauseMenu').close();
      switchScreen('startScreen');
      drawPreview(currentTrackIdx);
      document.getElementById('btnStartGame').focus();
    }

    function formatTime(sec) {
      if (!sec || isNaN(sec) || sec <= 0) return "--:--.---";
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec % 1) * 1000);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    }

    // Main Game Loop
    function gameLoop(timestamp) {
      if (!isGameRunning || isGamePaused) return;

      const pInput = input.getState();
      const rw = CIRCUITS[currentTrackIdx].roadWidth;
      // Fixed simulation rate prevents high-refresh displays speeding up the cars.
      physicsAccumulator += Math.min(Math.max(timestamp - lastFrameTime, 0), 100);
      lastFrameTime = timestamp;
      while (physicsAccumulator + 1e-7 >= PHYSICS_STEP_MS) {
        player.update(1 / 60, pInput, trackSpline, rw);
        botC1.update(1 / 60, botC1.computeAIInput(trackSpline, rw, player), trackSpline, rw);
        resolveCarCollision(player, botC1);
        updateCameraZoom();
        physicsAccumulator -= PHYSICS_STEP_MS;
      }
      audio.updateEngine(player.speed, player.maxSpeed);

      const raceElapsed = Math.max(0, (timestamp - raceClockStart) / 1000);
      if (!player.raceFinished && raceElapsed - lastGhostSampleTime >= 0.08) {
        ghostRecording.push({
          t: Math.round(raceElapsed * 1000) / 1000,
          x: Math.round(player.x * 10) / 10,
          y: Math.round(player.y * 10) / 10,
          a: Math.round(player.angle * 1000) / 1000
        });
        lastGhostSampleTime = raceElapsed;
      }

      // Render world relative to Player camera
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cameraZoom, cameraZoom);
      ctx.translate(-player.x, -player.y);

      // 1. Render Tarmac Surface
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = rw + 8;
      ctx.strokeStyle = '#cccccc'; // Curbs edge
      trackSpline.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.lineWidth = rw;
      ctx.strokeStyle = '#ffffff'; // White track surface
      trackSpline.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();

      // 2. Dashed centerline
      ctx.setLineDash([12, 16]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#d0d0d0';
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Start/Finish Line
      const sp = trackSpline[0];
      const np = trackSpline[1];
      const sa = Math.atan2(np.y - sp.y, np.x - sp.x) + Math.PI / 2;
      ctx.beginPath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#111111';
      ctx.moveTo(sp.x - Math.cos(sa) * (rw / 2), sp.y - Math.sin(sa) * (rw / 2));
      ctx.lineTo(sp.x + Math.cos(sa) * (rw / 2), sp.y + Math.sin(sa) * (rw / 2));
      ctx.stroke();

      // 4. Render Vehicles
      renderBestGhost(raceElapsed);
      renderCar(botC1);
      renderCar(player);

      ctx.restore();

      // HUD readout
      const nowSec = (timestamp - raceClockStart) / 1000;
      document.getElementById('hudTime').innerText = formatTime(nowSec);
      document.getElementById('hudLap').innerText = `${Math.min(player.lap, CIRCUITS[currentTrackIdx].laps)} / ${CIRCUITS[currentTrackIdx].laps}`;
      document.getElementById('hudSpeed').innerText = `${Math.floor(Math.abs(player.speed) * 20)} KM/H`;
      document.getElementById('hudHandling').innerText = player.isDrifting ? 'DRIFT' : 'GRIP';
      document.getElementById('hudPos').innerText = (player.currentSplineIndex + (player.lap * trackSpline.length)) >=
        (botC1.currentSplineIndex + (botC1.lap * trackSpline.length)) ? "P1" : "P2";

      if (player.lapTimes.length > 0) {
        document.getElementById('hudBest').innerText = formatTime(Math.min(...player.lapTimes));
      }

      // Check race end
      if (player.raceFinished && botC1.raceFinished) {
        endRace();
        return;
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    }

    function renderCar(car) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      // Chassis
      ctx.fillStyle = car.color;
      ctx.fillRect(-car.length / 2, -car.width / 2, car.length, car.width);

      // Driver cockpit indicator
      ctx.fillStyle = car.color === '#111111' ? '#ffffff' : '#111111';
      ctx.fillRect(-car.length * 0.1, -car.width * 0.28, car.length * 0.35, car.width * 0.56);

      // Tires
      ctx.fillStyle = '#111111';
      ctx.fillRect(-car.length * 0.45, -car.width * 0.55 - 2, 7, 3);
      ctx.fillRect(-car.length * 0.45, car.width * 0.55 - 1, 7, 3);
      ctx.fillRect(car.length * 0.25, -car.width * 0.55 - 2, 7, 3);
      ctx.fillRect(car.length * 0.25, car.width * 0.55 - 1, 7, 3);

      // Front wing highlight
      ctx.fillRect(car.length * 0.45, -car.width * 0.5, 2, car.width);

      ctx.restore();

      // Car tag
      ctx.save();
      ctx.fillStyle = '#111111';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(car.label, car.x, car.y - 16);
      ctx.restore();
    }

    function renderBestGhost(elapsed) {
      if (bestGhost.length < 2 || elapsed > bestGhost[bestGhost.length - 1].t) return;
      while (ghostPlaybackIndex < bestGhost.length - 2
          && bestGhost[ghostPlaybackIndex + 1].t < elapsed) ghostPlaybackIndex++;
      const from = bestGhost[ghostPlaybackIndex];
      const to = bestGhost[ghostPlaybackIndex + 1];
      if (!from || !to) return;
      const progress = Math.max(0, Math.min(1, (elapsed - from.t) / Math.max(to.t - from.t, 0.001)));
      const angleDelta = Math.atan2(Math.sin(to.a - from.a), Math.cos(to.a - from.a));
      const ghost = {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
        angle: from.a + angleDelta * progress,
        length: player.length,
        width: player.width,
        color: '#777777',
        label: `BEST ${formatTime(bestGhostTime)}`
      };
      ctx.save();
      ctx.globalAlpha = 0.28;
      renderCar(ghost);
      ctx.restore();
    }

    function endRace() {
      cancelAnimationFrame(animationFrameId);
      isGameRunning = false;
      audio.stopEngine();

      const playerWon = player.totalRaceTime <= botC1.totalRaceTime;
      const gap = Math.abs(player.totalRaceTime - botC1.totalRaceTime);

      document.getElementById('lbResultTitle').innerText = playerWon ? "VICTORY: P1 FINISH" : `${OPPONENT_NAME} FINISHED FIRST`;
      document.getElementById('lbResultSummary').innerText =
        `YOUR TIME: ${formatTime(player.totalRaceTime)} | ${OPPONENT_NAME} TIME: ${formatTime(botC1.totalRaceTime)} | GAP: ${gap.toFixed(3)}s`;

      pendingPlayerEntry = {
        trackIndex: currentTrackIdx,
        time: player.totalRaceTime,
        gap: (playerWon ? "-" : "+") + gap.toFixed(3) + "s",
        date: new Date().toISOString(),
        ghost: ghostRecording
      };

      document.getElementById('submitSection').style.display = 'block';
      document.getElementById('collisionWarning').style.display = 'none';
      document.getElementById('usernameInput').value = '';

      switchScreen('leaderboardScreen');
      loadLeaderboard(currentTrackIdx);
    }
