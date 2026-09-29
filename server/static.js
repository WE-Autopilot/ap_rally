const fs = require('node:fs');
const path = require('node:path');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function serveStatic(req, res, pathname, publicDir) {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  const filename = path.resolve(publicDir, '.' + (decoded === '/' ? '/index.html' : decoded));
  if (!filename.startsWith(publicDir + path.sep) || !types[path.extname(filename)]) return false;
  let content;
  try { content = fs.readFileSync(filename); } catch { return false; }
  res.writeHead(200, { 'Content-Type': types[path.extname(filename)], 'X-Content-Type-Options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : content);
  return true;
}
module.exports = { serveStatic };
