const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(isAI) {
  let now = 1000;
  const context = vm.createContext({ performance: { now: () => now } });
  for (const file of ['config', 'tracks', 'vehicle']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../public/js/${file}.js`), 'utf8'), context);
  }
  const run = code => vm.runInContext(code, context);
  run(`initTrack(0); const car = new Vehicle(${isAI}); car.lapStartTime = 1000;`);
  return { run, visit(index, time) {
    now = time;
    run(`car.currentSplineIndex = ${index}; car.updateLapTracking(trackSpline)`);
  } };
}

for (const isAI of [false, true]) {
  test(`${isAI ? 'C1' : 'player'} requires two full laps and retains throttle on lap 2`, () => {
    const game = setup(isAI);
    const length = game.run('trackSpline.length');
    // Starting behind the line, reversing, and jitter at the line are not laps.
    for (const index of [length - 2, 0, length - 1, 1, 0]) game.visit(index, 1100);
    assert.equal(game.run('car.lap'), 1);
    assert.equal(game.run('car.lapTimes.length'), 0);
    // Drive through all checkpoints in small forward increments, then cross.
    for (let i = 1; i < length; i++) game.visit(i, 1000 + i * 100);
    game.visit(0, 41000);
    assert.equal(game.run('car.lap'), 2);
    assert.equal(game.run('car.raceFinished'), false);
    assert.equal(game.run('car.lapTimes[0]'), 40);
    game.run(`
      car.x = trackSpline[0].x; car.y = trackSpline[0].y;
      car.angle = Math.atan2(trackSpline[1].y - car.y, trackSpline[1].x - car.x);
      car.speed = car.maxSpeed;
      car.update(1 / 60, { throttle: 1, steer: 0, handbrake: false }, trackSpline, CIRCUITS[0].roadWidth);
    `);
    assert.equal(game.run('car.speed'), game.run('car.maxSpeed'));
    for (const index of [length - 1, 0, length - 1, 0]) game.visit(index, 42000);
    assert.equal(game.run('car.lap'), 2);
    for (let i = 1; i < length; i++) game.visit(i, 41000 + i * 100);
    game.visit(0, 81000);
    assert.equal(game.run('car.raceFinished'), true);
    assert.equal(game.run('car.lapTimes.length'), 2);
    assert.equal(game.run('car.totalRaceTime'), 80);
    game.visit(length - 1, 82000); game.visit(0, 83000);
    assert.equal(game.run('car.lapTimes.length'), 2);
    game.run('car.reset()');
    assert.equal(game.run('car.nextLapCheckpoint'), 1);
    assert.equal(game.run('car.previousLapIndex'), 0);
  });
}

test('backwards travel and skipped checkpoints cannot complete a lap', () => {
  const game = setup(false);
  const length = game.run('trackSpline.length');
  for (let i = length - 1; i >= 0; i--) game.visit(i, 1000);
  assert.equal(game.run('car.lap'), 1);
  for (const index of [length - 10, length - 1, 0]) game.visit(index, 2000);
  assert.equal(game.run('car.lap'), 1);
});
