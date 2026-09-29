    // UI Event Wiring
    document.getElementById('btnPauseRace').addEventListener('click', pauseRace);
    document.getElementById('btnResumeRace').addEventListener('click', resumeRace);
    document.getElementById('btnQuitRace').addEventListener('click', quitRace);
    document.getElementById('btnShowControls').addEventListener('click', showPauseControls);
    document.getElementById('btnControlsBack').addEventListener('click', backFromPauseMenu);
    document.getElementById('pauseMenu').addEventListener('cancel', e => {
      e.preventDefault();
      backFromPauseMenu();
    });
    window.addEventListener('keydown', e => {
      if (e.code !== 'Escape' || !isGameRunning) return;
      e.preventDefault();
      if (e.repeat) return;
      if (isGamePaused) backFromPauseMenu();
      else pauseRace();
    });
    window.addEventListener('blur', pauseRace);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseRace();
    });

    async function loadAdminCircuit() {
      try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Config unavailable');
        const config = await response.json();
        if (Number.isInteger(config.trackIndex) && CIRCUITS[config.trackIndex]) {
          currentTrackIdx = config.trackIndex;
        }
      } catch (error) {
        // Keep the last known circuit if the local server is briefly unavailable.
      }
      drawPreview(currentTrackIdx);
    }

    document.getElementById('btnStartGame').addEventListener('click', async () => {
      await loadAdminCircuit();
      await loadBestGhost(currentTrackIdx);
      startRace();
    });

    document.getElementById('btnRestartRace').addEventListener('click', async () => {
      await loadBestGhost(currentTrackIdx);
      startRace();
    });

    document.getElementById('btnReturnMenu').addEventListener('click', () => {
      switchScreen('startScreen');
      drawPreview(currentTrackIdx);
    });

    // Username Submission & Collision Verification
    document.getElementById('btnSubmitTime').addEventListener('click', async () => {
      const inputEl = document.getElementById('usernameInput');
      const name = inputEl.value.trim();
      if (!name) return;

      const currentList = await fetchLeaderboardFromBackend(currentTrackIdx);
      const existing = currentList.find(e => e.name.toLowerCase() === name.toLowerCase());

      if (existing) {
        // Show duplicate username prompt
        const warnBox = document.getElementById('collisionWarning');
        const warnText = document.getElementById('collisionText');
        warnText.innerText = `Username "${name}" already exists on this circuit with time ${formatTime(existing.time)}. Are you the same player?`;
        warnBox.style.display = 'block';
      } else {
        finalizeSubmission(name);
      }
    });

    document.getElementById('btnConfirmOverwrite').addEventListener('click', () => {
      const name = document.getElementById('usernameInput').value.trim();
      finalizeSubmission(name);
    });

    document.getElementById('btnCancelOverwrite').addEventListener('click', () => {
      document.getElementById('collisionWarning').style.display = 'none';
      const inputEl = document.getElementById('usernameInput');
      inputEl.value = '';
      inputEl.focus();
    });

    async function finalizeSubmission(name) {
      if (!pendingPlayerEntry) return;
      pendingPlayerEntry.name = name;
      const updatedList = await postLeaderboardToBackend(pendingPlayerEntry);
      renderLeaderboardTable(updatedList);
      document.getElementById('submitSection').style.display = 'none';
    }

    // Init
    loadAdminCircuit();
    fetchLeaderboardFromBackend(0);

    const controllerMenus = new ControllerMenus();
    controllerMenus.start();
