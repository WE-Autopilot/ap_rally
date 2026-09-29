const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openDatabase } = require('../server/db/database');
const { submitEntry } = require('../server/services/leaderboard');
const { createApp } = require('../server/app');
const publicDir = path.resolve(__dirname, '../public');
const entry = (name, time, trackIndex = 0) => ({ trackIndex, name, time, gap: '+1.000s', date: '2026-09-29T12:00:00.000Z' });

test('ranking preserves case-insensitive matching, best times, ties, track isolation and top 50', () => {
  const db = openDatabase(':memory:');
  try {
    const save = payload => db.update(data => submitEntry(data, payload));
    save(entry(' Alice ', 50));
    save(entry('Bob', 50));
    save(entry('ALICE', 60));
    assert.deepEqual(db.readData()['0'].map(e => [e.name, e.time]), [['Alice', 50], ['Bob', 50]]);
    save(entry('alice', 40));
    assert.equal(db.readData()['0'][0].name, 'Alice');
    assert.equal(db.readData()['0'][0].time, 40);
    save(entry('Alice', 90, 1));
    for (let i = 0; i < 60; i++) save(entry(`Driver${i}`, 100 + i));
    assert.equal(db.readData()['0'].length, 50);
    assert.equal(db.readData()['0'].at(-1).time, 147);
    assert.equal(db.readData()['1'][0].time, 90);
  } finally { db.close(); }
});

test('database persists after reopen and failed writes roll back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rally-test-'));
  const filename = path.join(dir, 'db.sqlite');
  let db = openDatabase(filename);
  try {
    db.update(data => submitEntry(data, entry('Driver', 42)));
    assert.throws(() => db.update(data => { data['0'][0].name = null; }));
    db.close();
    db = openDatabase(filename);
    assert.equal(db.readData()['0'][0].name, 'Driver');
    assert.equal(db.readData()['0'][0].time, 42);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('HTTP API, errors, CORS and public-only static hosting', async t => {
  const database = openDatabase(':memory:');
  const server = createApp({ database, publicDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); database.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = route => fetch(base + route);
  const post = body => fetch(base + '/api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.deepEqual(await (await get('/api/leaderboard')).json(), {});
  assert.deepEqual(await (await get('/api/leaderboard?trackIndex=0')).json(), []);
  const payload = entry('Driver', 42);
  const saved = await (await post(JSON.stringify(payload))).json();
  assert.equal(saved.success, true);
  assert.deepEqual(saved.leaderboard, [{ name: 'Driver', time: 42, gap: payload.gap, date: payload.date }]);
  assert.deepEqual(await (await get('/api/leaderboard?trackIndex=0')).json(), saved.leaderboard);
  assert.equal((await post('{}')).status, 400);
  assert.equal((await post('not json')).status, 500);
  assert.equal((await post('x'.repeat(16385))).status, 413);
  const options = await fetch(base + '/api/leaderboard', { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');
  const home = await get('/');
  assert.equal(home.status, 200);
  const html = await home.text();
  for (const [, asset] of html.matchAll(/(?:src|href)="((?:js|css)\/[^\"]+)"/g)) {
    assert.equal((await get('/' + asset)).status, 200, asset);
  }
  for (const route of ['/server/index.js', '/data/leaderboard.sqlite', '/.env', '/%2e%2e%2fserver/index.js']) {
    assert.equal((await get(route)).status, 404, route);
  }
});

test('legacy import preserves records and refuses to overwrite a populated database', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rally-import-'));
  const filename = path.join(dir, 'db.sqlite');
  const source = path.join(dir, 'leaderboard.json');
  const records = { 0: [{ name: 'Legacy', time: 42 }] };
  fs.writeFileSync(source, JSON.stringify(records));
  const run = () => spawnSync(process.execPath, ['scripts/import-json.js', source], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, DATABASE_PATH: filename }, encoding: 'utf8'
  });
  try {
    assert.equal(run().status, 0);
    assert.equal(run().status, 1);
    const db = openDatabase(filename);
    try { assert.deepEqual(JSON.parse(JSON.stringify(db.readData())), records); } finally { db.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
