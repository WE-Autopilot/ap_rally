const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const hashes = require('./original-hashes.json');
const publicDir = path.resolve(__dirname, '../public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const hash = value => createHash('sha256').update(value).digest('hex');

test('extracted JavaScript, CSS and screen markup match the original exactly', () => {
  assert.equal(hash(scripts.map(file => fs.readFileSync(path.join(publicDir, file), 'utf8')).join('')), hashes.javascript);
  assert.equal(hash(fs.readFileSync(path.join(publicDir, 'css/game.css'))), hashes.css);
  const markup = html.replace('<link rel="stylesheet" href="css/game.css">', 'STYLES')
    .replace(/<script src="[^"]+"><\/script>(?:\n  <script src="[^"]+"><\/script>)*/, 'SCRIPTS');
  assert.equal(hash(markup), hashes.markup);
});

test('separate script files initialize, select every circuit and start a race', async () => {
  const elements = new Map();
  const drawing = new Proxy({}, { get: (target, key) => target[key] || (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      width: 600, height: 200, style: {}, classList: { add() {}, remove() {} },
      addEventListener() {}, getContext: () => drawing, appendChild() {}
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element, querySelectorAll: () => [], createElement: element },
    window: { innerWidth: 1280, innerHeight: 720, addEventListener() {} },
    navigator: {}, performance: { now: () => 1000 }, requestAnimationFrame() {},
    fetch: async () => ({ ok: true, json: async () => [] }),
    localStorage: { getItem: () => null, setItem() {} }
  });
  for (const file of scripts) vm.runInContext(fs.readFileSync(path.join(publicDir, file), 'utf8'), context, { filename: file });
  vm.runInContext(`
    audio.init = () => {};
    for (let i = 0; i < CIRCUITS.length; i++) {
      drawPreview(i);
      currentTrackIdx = i;
      startRace();
      gameLoop(1016);
    }
  `, context);
  assert.equal(vm.runInContext('CIRCUITS.length', context), 6);
  assert.equal(vm.runInContext('isGameRunning', context), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(element('backendStatus').innerText, /ONLINE/);
});
