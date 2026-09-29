    // UI Event Wiring
    document.querySelectorAll('.track-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('.track-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        currentTrackIdx = parseInt(btn.getAttribute('data-track'), 10);
        drawPreview(currentTrackIdx);
      });
    });

    document.getElementById('btnStartGame').addEventListener('click', () => {
      startRace();
    });

    document.getElementById('btnRestartRace').addEventListener('click', () => {
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
    drawPreview(0);
    fetchLeaderboardFromBackend(0);
  