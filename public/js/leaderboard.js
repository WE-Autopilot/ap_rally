    /* ==========================================================
       BACKEND & LOCALSTORAGE LEADERBOARD PERSISTENCE
       ========================================================== */

    async function fetchLeaderboardFromBackend(trackIdx) {
      try {
        const res = await fetch(`${BACKEND_URL}?trackIndex=${trackIdx}`, { method: 'GET' });
        if (!res.ok) throw new Error("HTTP error " + res.status);
        const data = await res.json();
        isBackendOnline = true;
        document.getElementById('backendStatus').innerText = "BACKEND: ONLINE (HTTP 127.0.0.1:3000)";
        return data;
      } catch (err) {
        isBackendOnline = false;
        document.getElementById('backendStatus').innerText = "BACKEND: OFFLINE (USING LOCAL STORAGE CACHE)";
        const cache = localStorage.getItem(`autopilot_lb_${trackIdx}`);
        return cache ? JSON.parse(cache) : getDefaultLeaderboard(trackIdx);
      }
    }

    async function postLeaderboardToBackend(entry) {
      if (isBackendOnline) {
        try {
          const res = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
          });
          if (res.ok) {
            const result = await res.json();
            return result.leaderboard;
          }
        } catch (e) {
          isBackendOnline = false;
        }
      }

      // Fallback local persistence
      const key = `autopilot_lb_${entry.trackIndex}`;
      let list = JSON.parse(localStorage.getItem(key) || "[]");
      if (list.length === 0) list = getDefaultLeaderboard(entry.trackIndex);

      const existingIdx = list.findIndex(i => i.name.toLowerCase() === entry.name.toLowerCase());
      if (existingIdx !== -1) {
        if (entry.time < list[existingIdx].time) {
          list[existingIdx].time = entry.time;
          list[existingIdx].gap = entry.gap;
          list[existingIdx].date = entry.date;
        }
      } else {
        list.push({ name: entry.name, time: entry.time, gap: entry.gap, date: entry.date });
      }

      list.sort((a, b) => a.time - b.time);
      list = list.slice(0, 50);
      localStorage.setItem(key, JSON.stringify(list));
      return list;
    }

    function getDefaultLeaderboard(trackIdx) {
      return [
        { name: "C1", time: 42.120 + trackIdx * 4.5, gap: "LEADER", date: new Date().toISOString() },
        { name: "AP_BOT_PRO", time: 44.380 + trackIdx * 4.5, gap: "+2.260s", date: new Date().toISOString() },
        { name: "GRID_TESTER", time: 47.900 + trackIdx * 4.5, gap: "+5.780s", date: new Date().toISOString() }
      ];
    }

    async function loadLeaderboard(trackIdx) {
      document.getElementById('lbTableTitle').innerText = `LEADERBOARD - ${CIRCUITS[trackIdx].name.toUpperCase()}`;
      const records = await fetchLeaderboardFromBackend(trackIdx);
      renderLeaderboardTable(records);
    }

    function renderLeaderboardTable(records) {
      const tbody = document.getElementById('lbTableBody');
      tbody.innerHTML = '';

      if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px;">NO TIMES LOGGED YET</td></tr>`;
        return;
      }

      records.forEach((row, i) => {
        const tr = document.createElement('tr');
        if (row.name === "C1") tr.classList.add('highlight');
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${escapeHtml(row.name)}</td>
          <td>${formatTime(row.time)}</td>
          <td>${row.gap || '-'}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[m]);
    }

