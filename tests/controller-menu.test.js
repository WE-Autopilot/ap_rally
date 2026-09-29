const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  const nodes = new Map();
  let pad = { connected: true, buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [0, 0] };
  let time = 0;
  let activeScope;
  const document = { hidden: false, hasFocus: () => true, activeElement: null,
    getElementById: id => nodes.get(id), querySelector: () => activeScope };
  function node(id, classes = [], action = () => {}) {
    const classNames = new Set(classes);
    const element = { id, textContent: id, visible: true, disabled: false, clicks: 0,
      classList: { add: c => classNames.add(c), remove: c => classNames.delete(c), contains: c => classNames.has(c) },
      getClientRects() { return this.visible ? [1] : []; },
      focus() { document.activeElement = this; }, scrollIntoView() {},
      click() { this.clicks++; action(); }, querySelectorAll() { return this.children || []; }
    };
    nodes.set(id, element);
    return element;
  }
  const startScreen = node('startScreen');
  const warning = node('collisionWarning'); warning.visible = false;
  const pause = node('pauseMenu');
  const results = node('leaderboardScreen');
  const context = vm.createContext({ document, navigator: { getGamepads: () => [null, null, pad] },
    window: { addEventListener() {} }, audio: { init() {} },
    isGameRunning: false, isGamePaused: false,
    pauseRace() { context.isGamePaused = true; document.activeElement = nodes.get('btnResumeRace'); },
    resumeRace() { context.isGamePaused = false; },
  });
  const tracks = Array.from({ length: 6 }, (_, i) => node('track' + i, ['track-btn', ...(i === 0 ? ['selected'] : [])]));
  const start = node('btnStartGame', [], () => { context.isGameRunning = true; });
  startScreen.children = [...tracks, start];
  pause.children = [node('btnResumeRace', [], context.resumeRace), node('btnQuitRace', [], () => {
    context.isGameRunning = false; context.isGamePaused = false; activeScope = startScreen;
  })];
  results.children = [node('usernameInput'), node('btnSubmitTime'), node('btnRestartRace', [], () => { context.isGameRunning = true; }), node('btnReturnMenu', [], () => { activeScope = startScreen; })];
  warning.children = [node('btnConfirmOverwrite'), node('btnCancelOverwrite', [], () => { warning.visible = false; })];
  activeScope = startScreen;
  for (const file of ['input', 'controller-menu']) vm.runInContext(fs.readFileSync(path.join(__dirname, `../public/js/${file}.js`), 'utf8'), context);
  vm.runInContext('const menus = new ControllerMenus()', context);
  function update(delta = 16) { time += delta; context.now = time; vm.runInContext('menus.update(now)', context); }
  function press(button) { pad.buttons[button].pressed = true; update(); }
  function release() { pad.buttons.forEach(b => { b.pressed = false; }); pad.axes = [0, 0]; update(); }
  return { nodes, document, context, update, press, release, pad,
    results() { context.isGameRunning = false; context.isGamePaused = false; activeScope = results; document.activeElement = null; },
    disconnect() { pad = null; update(); }
  };
}

test('controller in any slot navigates the circuit grid and starts a race', () => {
  const game = setup();
  game.press(15); // Right, from selected track 0.
  assert.equal(game.document.activeElement.id, 'track1');
  assert.equal(game.nodes.get('track1').clicks, 1);
  game.update(100);
  assert.equal(game.document.activeElement.id, 'track1');
  game.update(300);
  assert.equal(game.document.activeElement.id, 'track2');
  game.release();
  game.press(13);
  assert.equal(game.document.activeElement.id, 'track5');
  game.release(); game.press(13);
  assert.equal(game.document.activeElement.id, 'btnStartGame');
  game.release(); game.press(0);
  assert.equal(game.context.isGameRunning, true);
});

test('Start pauses once, B resumes, and A can end a paused race', () => {
  const game = setup();
  game.press(9); // Start from menu.
  game.update();
  assert.equal(game.context.isGamePaused, false);
  game.release(); game.press(9);
  assert.equal(game.context.isGamePaused, true);
  game.update(500);
  assert.equal(game.context.isGamePaused, true);
  game.release(); game.press(1);
  assert.equal(game.context.isGamePaused, false);
  game.release(); game.press(9); game.release(); game.press(13);
  assert.equal(game.document.activeElement.id, 'btnQuitRace');
  game.release(); game.press(0);
  assert.equal(game.context.isGameRunning, false);
});

test('results support retry, return, hidden-control skipping and collision cancellation', () => {
  const game = setup(); game.results();
  game.nodes.get('usernameInput').visible = false;
  game.nodes.get('btnSubmitTime').visible = false;
  game.press(0);
  assert.equal(game.nodes.get('btnRestartRace').clicks, 1);
  game.release(); game.results(); game.press(1);
  assert.equal(game.nodes.get('btnReturnMenu').clicks, 1);
  game.release(); game.results();
  game.nodes.get('collisionWarning').visible = true;
  game.press(1);
  assert.equal(game.nodes.get('btnCancelOverwrite').clicks, 1);
});

test('stick deadzone, held-button transitions, background protection and disconnect', () => {
  const game = setup();
  game.pad.axes[0] = 0.2; game.update();
  assert.equal(game.document.activeElement, null);
  game.pad.axes[0] = 0.7; game.update();
  assert.equal(game.document.activeElement.id, 'track1');
  game.release();
  game.context.isGameRunning = true; game.press(0); // Holding gas at race end.
  game.results(); game.update();
  assert.equal(game.nodes.get('usernameInput').clicks, 0);
  game.release(); game.document.hidden = true; game.press(9);
  assert.equal(game.nodes.get('btnRestartRace').clicks, 0);
  game.document.hidden = false; game.update();
  assert.equal(game.nodes.get('btnRestartRace').clicks, 0);
  game.disconnect();
  assert.equal(game.nodes.get('track1').classList.contains('controller-focus'), false);
});
