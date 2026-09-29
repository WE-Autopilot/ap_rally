const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the real driving controller and vehicle physics, without canvas/browser timing.
function simulateCircuit(trackIndex, { recovery = false, countDrifts = false } = {}) {
  let now = 1000;
  const context = vm.createContext({ performance: { now: () => now } });
  for (const file of ['config', 'tracks', 'vehicle']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, `../../public/js/${file}.js`), 'utf8'), context);
  }
  context.trackIndex = trackIndex;
  context.recovery = recovery;
  context.countDrifts = countDrifts;
  context.tickClock = tick => { now = 1000 + tick * 1000 / 60; };
  return vm.runInContext(`
    initTrack(trackIndex);
    // Endurance run: do not stop at the two-lap race limit.
    CIRCUITS[trackIndex].laps = 1000;
    const car = new Vehicle(true);
    const start = trackSpline[0], next = trackSpline[2];
    car.angle = Math.atan2(next.y - start.y, next.x - start.x);
    car.x = start.x + Math.sin(car.angle) * 14 - Math.cos(car.angle) * 20;
    car.y = start.y - Math.cos(car.angle) * 14 - Math.sin(car.angle) * 20;
    car.lapStartTime = 1000;
    let offRoadTicks = 0, speedSum = 0, distanceTravelled = 0, recoveryTicks = 0;
    let recovering = false, handbrakeTicks = 0;
    const ticks = 7200;
    for (let tick = 0; tick < ticks; tick++) {
      tickClock(tick);
      if (recovery && tick === 600) {
        // A collision-like displacement beyond the road edge plus a heading deflection.
        car.x -= Math.sin(car.angle) * 90;
        car.y += Math.cos(car.angle) * 90;
        car.angle += 1.2;
        recovering = true;
      }
      const controls = car.computeAIInput(trackSpline);
      if (controls.handbrake) handbrakeTicks++;
      if (!Number.isFinite(controls.steer) || !Number.isFinite(controls.throttle)
          || Math.abs(controls.steer) > 1 || Math.abs(controls.throttle) > 1) {
        throw new Error('Invalid AI controls');
      }
      car.update(1 / 60, controls, trackSpline, CIRCUITS[trackIndex].roadWidth);
      const distance = car.getDistanceFromCenterline(trackSpline);
      const offRoad = distance > CIRCUITS[trackIndex].roadWidth / 2;
      if (offRoad) offRoadTicks++;
      if (recovering) {
        recoveryTicks++;
        if (!offRoad && car.speed > car.maxSpeed * 0.7) recovering = false;
      }
      speedSum += car.speed;
      distanceTravelled += Math.abs(car.speed);
    }
    ({ name: CIRCUITS[trackIndex].name, meanSpeed: speedSum / ticks,
       offRoadPercent: offRoadTicks / ticks * 100,
       circuitsTravelled: distanceTravelled / trackLength,
       recoverySeconds: recoveryTicks / 60, recovered: !recovering,
       ...(countDrifts ? { handbrakeTicks } : {}) });
  `, context);
}
module.exports = { simulateCircuit };
