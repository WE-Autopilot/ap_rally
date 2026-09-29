const http = require('node:http');
const { submitEntry } = require('./services/leaderboard');
const { serveStatic } = require('./static');

function createApp({ database, publicDir, adminPassword = 'weap' }) {
  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    const isAdmin = () => req.headers.authorization ===
      `Basic ${Buffer.from(`admin:${adminPassword}`).toString('base64')}`;
    const requireAdmin = () => {
      if (isAdmin()) return true;
      res.setHeader('WWW-Authenticate', 'Basic realm="Autopilot Rally Admin"');
      json(401, { error: 'Invalid admin password' });
      return false;
    };
    const readJson = (callback, invalidStatus = 400) => {
      let body = '';
      let bytes = 0;
      req.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1048576) {
          if (!res.writableEnded) json(413, { error: 'Payload too large' });
          return;
        }
        body += chunk;
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        try { callback(JSON.parse(body)); }
        catch (error) { json(invalidStatus, { error: 'Invalid payload' }); }
      });
    };

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { json(400, { error: 'Invalid URL' }); return; }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      json(200, { trackIndex: Number(database.getSetting('selected_circuit') || 0) });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/ghost') {
      const trackIndex = url.searchParams.get('trackIndex');
      const leader = database.readData()[trackIndex]?.[0];
      json(200, { time: leader?.time || null, ghost: leader?.ghost || [] });
      return;
    }
    if (url.pathname === '/api/admin/data' && req.method === 'GET') {
      if (!requireAdmin()) return;
      json(200, {
        trackIndex: Number(database.getSetting('selected_circuit') || 0),
        leaderboards: database.readData()
      });
      return;
    }
    if (url.pathname === '/api/admin/config' && req.method === 'PUT') {
      if (!requireAdmin()) return;
      readJson(payload => {
        const trackIndex = Number(payload.trackIndex);
        if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex > 5) {
          json(400, { error: 'Circuit must be an integer from 0 to 5' });
          return;
        }
        database.setSetting('selected_circuit', trackIndex);
        json(200, { success: true, trackIndex });
      });
      return;
    }
    const entryMatch = url.pathname.match(/^\/api\/admin\/entries\/(\d+)\/(\d+)$/);
    if (entryMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (!requireAdmin()) return;
      const trackIndex = Number(entryMatch[1]);
      const position = Number(entryMatch[2]);
      const mutate = payload => {
        try {
          const leaderboard = database.update(data => {
            const rows = data[String(trackIndex)] || [];
            if (!rows[position]) throw new RangeError('Leaderboard row not found');
            if (req.method === 'DELETE') rows.splice(position, 1);
            else {
              const name = String(payload.name || '').trim();
              const time = Number(payload.time);
              if (!name || name.length > 16 || !Number.isFinite(time) || time < 0) {
                throw new TypeError('Name and non-negative time are required');
              }
              rows[position] = {
                name,
                time,
                gap: payload.gap === undefined ? rows[position].gap : payload.gap,
                date: payload.date === undefined ? rows[position].date : payload.date,
                ghost: rows[position].ghost
              };
              rows.sort((a, b) => a.time - b.time);
            }
            data[String(trackIndex)] = rows;
            return rows;
          });
          json(200, { success: true, leaderboard });
        } catch (error) {
          json(error instanceof RangeError ? 404 : 400, { error: error.message });
        }
      };
      if (req.method === 'DELETE') mutate({});
      else readJson(mutate);
      return;
    }
    if (url.pathname === '/api/admin/leaderboard' && req.method === 'DELETE') {
      if (!requireAdmin()) return;
      database.update(data => {
        for (const key of Object.keys(data)) delete data[key];
      });
      json(200, { success: true });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
      try {
        const data = database.readData();
        const trackIndex = url.searchParams.get('trackIndex');
        json(200, trackIndex !== null ? data[trackIndex] || [] : data);
      } catch (error) {
        console.error('Leaderboard read failed:', error);
        json(500, { error: 'Database unavailable' });
      }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/leaderboard') {
      readJson(payload => {
        const { trackIndex, name, time } = payload;
        if (trackIndex === undefined || !name || time === undefined) {
          json(400, { error: 'Missing trackIndex, name, or time' });
          return;
        }
        if (Number(trackIndex) !== Number(database.getSetting('selected_circuit') || 0)) {
          json(409, { error: 'This circuit is not currently active' });
          return;
        }
        try {
          const leaderboard = database.update(data => submitEntry(data, payload));
          json(200, { success: true, leaderboard });
        } catch (error) { json(400, { error: 'Invalid payload' }); }
      }, 500);
      return;
    }
    if (serveStatic(req, res, url.pathname, publicDir)) return;
    json(404, { error: 'Not found' });
  });
}
module.exports = { createApp };
