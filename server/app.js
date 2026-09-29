const http = require('node:http');
const { submitEntry } = require('./services/leaderboard');
const { serveStatic } = require('./static');

function createApp({ database, publicDir }) {
  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    function json(status, value) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { json(400, { error: 'Invalid URL' }); return; }
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
      let body = '';
      let bytes = 0;
      req.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 16384) {
          if (!res.writableEnded) json(413, { error: 'Payload too large' });
          return;
        }
        body += chunk;
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        try {
          const payload = JSON.parse(body);
          const { trackIndex, name, time } = payload;
          if (trackIndex === undefined || !name || time === undefined) {
            json(400, { error: 'Missing trackIndex, name, or time' });
            return;
          }
          const leaderboard = database.update(data => submitEntry(data, payload));
          json(200, { success: true, leaderboard });
        } catch (error) {
          json(500, { error: 'Invalid payload' });
        }
      });
      return;
    }
    if (serveStatic(req, res, url.pathname, publicDir)) return;
    json(404, { error: 'Not found' });
  });
}
module.exports = { createApp };
