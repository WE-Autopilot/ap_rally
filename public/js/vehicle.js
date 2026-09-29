    // Vehicle Object
    class Vehicle {
      constructor(isAI = false, label = "P1", color = "#111111") {
        this.isAI = isAI;
        this.label = label;
        this.color = color;
        this.reset();
      }

      reset() {
        this.x = 0;
        this.y = 0;
        this.angle = 0;
        this.speed = 0;
        this.vx = 0;
        this.vy = 0;
        this.length = 26;
        this.width = 14;
        this.radius = 12;

        // Physics parameters
        this.maxSpeed = this.isAI ? 10.9 : 10.7; // C1 is hyper-tuned
        this.accel = 0.28;
        this.brake = 0.45;
        this.friction = 0.982;
        this.turnRate = 0.055;
        this.offRoadFriction = 0.90;

        // Lap progression
        this.currentSplineIndex = 0;
        this.lap = 1;
        this.lapTimes = [];
        this.lapStartTime = 0;
        this.raceFinished = false;
        this.totalRaceTime = 0;

        // AI tracking state
        this.aiTargetIndex = 5;
      }

      update(dt, state, spline, roadWidth) {
        if (this.raceFinished) {
          this.speed *= 0.92;
          this.x += Math.cos(this.angle) * this.speed;
          this.y += Math.sin(this.angle) * this.speed;
          return;
        }

        // Steer & Acceleration
        if (Math.abs(this.speed) > 0.2) {
          const dir = this.speed >= 0 ? 1 : -1;
          this.angle += state.steer * this.turnRate * dir;
        }

        if (state.throttle > 0) {
          this.speed += state.throttle * this.accel;
        } else if (state.throttle < 0) {
          this.speed += state.throttle * this.brake;
        }

        if (state.handbrake) {
          this.speed *= 0.91;
        }

        // Environment friction check
        const distFromCenter = this.getDistanceFromCenterline(spline);
        if (distFromCenter > roadWidth / 2) {
          this.speed *= this.offRoadFriction;
          if (this.speed > 4.5) this.speed = 4.5;
        } else {
          this.speed *= this.friction;
        }

        // Cap speed
        if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
        if (this.speed < -this.maxSpeed * 0.4) this.speed = -this.maxSpeed * 0.4;

        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        this.updateLapTracking(spline);
      }

      getDistanceFromCenterline(spline) {
        let minDistSq = Infinity;
        let closestIdx = this.currentSplineIndex;
        const searchRange = 30;
        const len = spline.length;

        for (let i = -searchRange; i <= searchRange; i++) {
          const idx = (this.currentSplineIndex + i + len) % len;
          const p = spline[idx];
          const dSq = (this.x - p.x) ** 2 + (this.y - p.y) ** 2;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            closestIdx = idx;
          }
        }
        this.currentSplineIndex = closestIdx;
        return Math.sqrt(minDistSq);
      }

      updateLapTracking(spline) {
        const len = spline.length;
        // Detect lap line pass (transition from near end to beginning)
        if (this.currentSplineIndex > len - 15 && !this.crossedStartLine) {
          this.canCross = true;
        }
        if (this.canCross && this.currentSplineIndex < 15) {
          this.canCross = false;
          const now = performance.now();
          if (this.lapStartTime > 0) {
            const lapTime = (now - this.lapStartTime) / 1000;
            this.lapTimes.push(lapTime);
          }
          this.lapStartTime = now;
          this.lap++;

          if (this.lap > CIRCUITS[currentTrackIdx].laps) {
            this.raceFinished = true;
            this.totalRaceTime = this.lapTimes.reduce((a, b) => a + b, 0);
          }
        }
      }

      // Apex-trail braking, curvature-predictive AI algorithm for C1
      computeAIInput(spline) {
        const len = spline.length;
        // Lookahead dynamic anchor
        const lookahead = Math.floor(10 + (this.speed / this.maxSpeed) * 16);
        const targetIdx = (this.currentSplineIndex + lookahead) % len;
        const target = spline[targetIdx];

        // Measure track curvature ahead (difference in angle between lookahead point and deeper curve)
        const deepIdx = (targetIdx + 12) % len;
        const deepTarget = spline[deepIdx];
        const headingToTarget = Math.atan2(target.y - this.y, target.x - this.x);
        const headingToDeep = Math.atan2(deepTarget.y - target.y, deepTarget.x - target.x);
        let cornerSharpness = Math.abs(Math.atan2(Math.sin(headingToDeep - headingToTarget), Math.cos(headingToDeep - headingToTarget)));

        let diffAngle = Math.atan2(Math.sin(headingToTarget - this.angle), Math.cos(headingToTarget - this.angle));
        let steer = Math.max(-1, Math.min(1, diffAngle * 3.5));

        // Trail brake before sharp corners, full throttle on straights
        let throttle = 1.0;
        if (cornerSharpness > 0.45 && this.speed > 5.5) {
          throttle = -0.6; // Heavy braking into hairpin apex
        } else if (Math.abs(diffAngle) > 0.5 && this.speed > 7.0) {
          throttle = 0.1; // Gentle lift off
        }

        return { steer, throttle, handbrake: false };
      }
    }

    // Elastic bumper collision physics between 2 cars
    function resolveCarCollision(carA, carB) {
      const dx = carB.x - carA.x;
      const dy = carB.y - carA.y;
      const dist = Math.hypot(dx, dy);
      const minDist = carA.radius + carB.radius;

      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        // Push apart
        carA.x -= nx * overlap * 0.5;
        carA.y -= ny * overlap * 0.5;
        carB.x += nx * overlap * 0.5;
        carB.y += ny * overlap * 0.5;

        // Impulse exchange
        const relSpeed = (carA.speed - carB.speed) * 0.5;
        carA.speed -= relSpeed * 0.6;
        carB.speed += relSpeed * 0.6;

        audio.playThud();
      }
    }

