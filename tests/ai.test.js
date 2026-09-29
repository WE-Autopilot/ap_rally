const test = require('node:test');
const assert = require('node:assert/strict');
const { simulateCircuit } = require('./helpers/ai-simulation.cjs');

// Measured with the previous controller over the same two-minute, 60 Hz runs.
const previousMeanSpeeds = [3.13, 3.94, 3.00, 3.48, 3.00, 2.84];
for (let track = 0; track < 6; track++) {
  test(`C1 expert maintains fast, clean driving on circuit ${track + 1}`, () => {
    const result = simulateCircuit(track);
    // Equal top speed removes the former straight-line advantage.
    assert.ok(result.meanSpeed > previousMeanSpeeds[track] * 1.5, JSON.stringify(result));
    assert.ok(result.offRoadPercent < 0.5, JSON.stringify(result));
    assert.ok(result.circuitsTravelled > 4, JSON.stringify(result));
  });
  test(`C1 recovers from a collision-like displacement on circuit ${track + 1}`, () => {
    const result = simulateCircuit(track, { recovery: true });
    assert.ok(result.recovered && result.recoverySeconds < 8, JSON.stringify(result));
    assert.ok(result.offRoadPercent < 5, JSON.stringify(result));
  });
}

test('C1 uses the handbrake selectively for difficult corners', () => {
  const result = simulateCircuit(3, { countDrifts: true });
  assert.ok(result.handbrakeTicks > 0, JSON.stringify(result));
  assert.ok(result.handbrakeTicks < 720, JSON.stringify(result));
});
