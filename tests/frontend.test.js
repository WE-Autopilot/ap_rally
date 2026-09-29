const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const publicDir = path.resolve(__dirname, '../public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

function createGame() {
  const elements = new Map();
  const frames = new Map();
  const listeners = new Map();
  let now = 1000;
  let nextFrame = 0;
  const drawing = new Proxy({}, { get: (target, key) => target[key] || (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      width: 600, height: 200, style: {}, classList: { add() {}, remove() {} },
      handlers: {}, open: false,
      addEventListener(name, handler) { this.handlers[name] = handler; },
      getContext: () => drawing, appendChild() {}, focus() {},
      showModal() { this.open = true; }, close() { this.open = false; }
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element, querySelectorAll: () => [], createElement: element, addEventListener() {} },
    window: { innerWidth: 1280, innerHeight: 720, addEventListener(name, handler) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(handler);
    } },
    setInterval() {},
    navigator: {}, performance: { now: () => now },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    fetch: async () => ({ ok: true, json: async () => [] }),
    localStorage: { getItem: () => null, setItem() {} }
  });
  const run = code => vm.runInContext(code, context);
  for (const file of scripts) vm.runInContext(fs.readFileSync(path.join(publicDir, file), 'utf8'), context, { filename: file });
  run('audio.init = () => {};');
  return {
    run, element, frames,
    setTime(value) { now = value; },
    frame(time) {
      now = time;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback(time));
    },
    key(code, repeat = false) {
      for (const callback of listeners.get('keydown') || []) callback({ code, repeat, preventDefault() {} });
    },
    blur() { for (const callback of listeners.get('blur') || []) callback(); }
  };
}

test('all six larger circuits initialize and both cars have lower speed limits', async () => {
  const game = createGame();
  assert.equal(game.run('CIRCUITS.length'), 6);
  assert.equal(game.run('CIRCUITS[0].nodes[0].x'), 450);
  assert.ok(Math.abs(game.run('CIRCUITS[0].roadWidth') - 126) < 1e-9);
  assert.ok(Math.abs(game.run('player.maxSpeed') - 6.42) < 1e-9);
  assert.equal(game.run('botC1.maxSpeed'), game.run('player.maxSpeed'));
  assert.ok(Math.abs(game.run('player.accel') - 0.168) < 1e-9);
  assert.ok(Math.abs(game.run('player.brake') - 0.27) < 1e-9);
  assert.ok(Math.abs(game.run('player.turnRate') - 0.044) < 1e-9);
  for (let i = 0; i < 6; i++) {
    game.run(`drawPreview(${i}); currentTrackIdx = ${i}; startRace();`);
    assert.equal(game.frames.size, 1);
    game.frame(1017 + i * 20);
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.match(game.element('backendStatus').innerText, /ONLINE/);
});

test('Escape freezes cars and timer; resume excludes every pause from both lap clocks', () => {
  const game = createGame();
  game.run('startRace()');
  game.key('KeyW');
  game.frame(2000);
  const positions = game.run('JSON.stringify([player.x, player.y, botC1.x, botC1.y])');
  const hudTime = game.element('hudTime').innerText;
  game.key('Escape');
  assert.equal(game.element('pauseMenu').open, true);
  assert.equal(game.frames.size, 0);
  game.key('KeyW');
  assert.equal(game.run('input.getState().throttle'), 0);
  game.key('Escape', true);
  assert.equal(game.run('isGamePaused'), true);
  game.frame(7000);
  game.run('gameLoop(7000)'); // Even a stale callback cannot move cars while paused.
  assert.equal(game.run('JSON.stringify([player.x, player.y, botC1.x, botC1.y])'), positions);
  assert.equal(game.element('hudTime').innerText, hudTime);
  game.key('Escape');
  assert.equal(game.element('pauseMenu').open, false);
  assert.equal(game.frames.size, 1);
  assert.equal(game.run('raceClockStart'), 6000);
  assert.equal(game.run('player.lapStartTime'), 6000);
  assert.equal(game.run('botC1.lapStartTime'), 6000);
  game.frame(8000);
  assert.equal(game.element('hudTime').innerText, '00:02.000');
  game.element('btnPauseRace').handlers.click();
  game.setTime(11000);
  game.element('btnResumeRace').handlers.click();
  game.run('player.canCross = true; player.currentSplineIndex = 0; player.updateLapTracking(trackSpline);');
  assert.equal(game.run('player.lapTimes[0]'), 2);
  assert.equal(game.frames.size, 1);
});

test('quit never submits an unfinished race, and restarting leaves one clean animation loop', () => {
  const game = createGame();
  game.key('Escape');
  assert.equal(game.element('pauseMenu').open, false);
  game.run('startRace(); player.canCross = true; pendingPlayerEntry = { time: 5 };');
  game.blur();
  assert.equal(game.element('pauseMenu').open, true);
  game.element('btnQuitRace').handlers.click();
  assert.equal(game.run('isGameRunning || isGamePaused'), false);
  assert.equal(game.run('pendingPlayerEntry'), null);
  assert.equal(game.frames.size, 0);
  assert.equal(game.element('pauseMenu').open, false);
  game.run('startRace(); startRace();');
  assert.equal(game.run('player.canCross'), false);
  assert.equal(game.frames.size, 1);
});

test('driving covers the same distance at 30, 60 and 144 Hz', () => {
  function drive(hz) {
    const game = createGame();
    game.run('startRace()');
    game.key('KeyW');
    for (let i = 1; i <= hz * 2; i++) game.frame(1000 + i * 1000 / hz);
    return JSON.parse(game.run('JSON.stringify([player.x, player.y, player.speed, botC1.x, botC1.y])'));
  }
  const reference = drive(60);
  for (const hz of [30, 144]) {
    const result = drive(hz);
    result.forEach((value, i) => assert.ok(Math.abs(value - reference[i]) < 1e-6, `${hz} Hz: component ${i}`));
  }
});

test('C1 still completes each enlarged circuit with the new speed and steering', () => {
  const game = createGame();
  // Advance the clock through each simulation tick without rendering thousands of frames.
  for (let track = 0; track < 6; track++) {
    game.setTime(1000);
    game.run(`currentTrackIdx = ${track}; startRace();`);
    for (let tick = 1; tick <= 36000 && !game.run('botC1.raceFinished'); tick++) {
      game.setTime(1000 + tick * 1000 / 60);
      game.run('botC1.update(1 / 60, botC1.computeAIInput(trackSpline), trackSpline, CIRCUITS[currentTrackIdx].roadWidth)');
    }
    assert.equal(game.run('botC1.raceFinished'), true, `Circuit ${track + 1}`);
  }
});


test('pause controls open and go back without resuming or advancing the race clock', () => {
  const game = createGame();
  game.run('startRace()');
  game.key('Escape');
  game.element('btnShowControls').handlers.click();
  assert.equal(game.element('pauseControls').hidden, false);
  assert.equal(game.element('pauseActions').hidden, true);
  assert.equal(game.frames.size, 0);
  game.setTime(5000);
  game.key('Escape');
  assert.equal(game.element('pauseControls').hidden, true);
  assert.equal(game.run('isGamePaused'), true);
  game.element('btnShowControls').handlers.click();
  game.element('btnControlsBack').handlers.click();
  assert.equal(game.run('isGamePaused'), true);
  game.key('Escape');
  assert.equal(game.run('isGamePaused'), false);
  assert.equal(game.run('raceClockStart'), 5000);
  game.key('Escape');
  assert.equal(game.element('pauseActions').hidden, false);
  assert.equal(game.element('pauseControls').hidden, true);
});
