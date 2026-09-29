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
        this.driftAngle = 0;
        this.isDrifting = false;
        this.driftTimer = 0;
        this.length = 26;
        this.width = 14;
        this.radius = 12;

        // Physics parameters
        this.maxSpeed = 10.7 * GAME_BALANCE.speedScale;
        this.accel = 0.28 * GAME_BALANCE.accelerationScale;
        this.brake = 0.45 * GAME_BALANCE.brakingScale;
        this.friction = 0.988;
        this.turnRate = 0.055 * GAME_BALANCE.steeringScale;
        this.offRoadFriction = 0.91;
        if (this.isAI) {
          this.accel *= C1_TUNING.accelerationMultiplier;
          this.brake *= C1_TUNING.brakingMultiplier;
          this.turnRate *= C1_TUNING.steeringMultiplier;
        }

        // Lap progression
        this.currentSplineIndex = 0;
        this.lap = 1;
        this.lapTimes = [];
        this.lapStartTime = 0;
        this.previousLapIndex = 0;
        this.nextLapCheckpoint = 1;
        this.raceFinished = false;
        this.totalRaceTime = 0;

        // AI tracking state
        this.aiTargetIndex = 5;
        this.aiLastProgress = 0;
        this.aiStuckTicks = 0;
      }

      update(dt, state, spline, roadWidth) {
        if (this.raceFinished) {
          this.speed *= 0.92;
          this.x += Math.cos(this.angle) * this.speed;
          this.y += Math.sin(this.angle) * this.speed;
          return;
        }

        const speedRatio = Math.min(1, Math.abs(this.speed) / Math.max(this.maxSpeed, 0.001));
        const canStartDrift = state.handbrake && Math.abs(state.steer) > 0.2 && speedRatio > 0.42;
        if (canStartDrift) this.driftTimer = 0.42;
        else this.driftTimer = Math.max(0, this.driftTimer - dt);

        const activelyDrifting = this.driftTimer > 0 && speedRatio > 0.28;

        // Steering is calmer near rest and sharpens with speed, like an arcade racer.
        if (Math.abs(this.speed) > 0.2) {
          const dir = this.speed >= 0 ? 1 : -1;
          const speedSteering = 0.72 + speedRatio * 0.38;
          const driftSteering = activelyDrifting ? 1.5 : 1;
          this.angle += state.steer * this.turnRate * dir * speedSteering * driftSteering;
          // The velocity keeps its old heading while the nose rotates into the corner.
          this.driftAngle -= state.steer * this.turnRate * dir * driftSteering * (0.25 + speedRatio * 0.8);
        }

        if (state.throttle > 0) {
          this.speed += state.throttle * this.accel;
        } else if (state.throttle < 0) {
          this.speed += state.throttle * this.brake;
        }

        if (state.handbrake) {
          // A short tap initiates the slide without acting like a conventional brake.
          this.speed *= canStartDrift ? 0.994 : 0.982;
        }

        // Counter-steering catches a slide quickly; holding the turn sustains it.
        const isCounterSteering = Math.abs(state.steer) > 0.15
          && Math.sign(state.steer) === Math.sign(this.driftAngle);
        if (isCounterSteering) this.driftAngle *= Math.pow(0.84, dt * 60);
        const grip = activelyDrifting ? 0.972 : 0.80;
        this.driftAngle *= Math.pow(grip, dt * 60);
        this.driftAngle = Math.max(-0.82, Math.min(0.82, this.driftAngle));
        this.isDrifting = activelyDrifting && Math.abs(this.driftAngle) > 0.075;

        // Clean, shallow slides preserve speed; excessive angle scrubs momentum.
        if (this.isDrifting) {
          const excessSlip = Math.max(0, Math.abs(this.driftAngle) - 0.24);
          this.speed *= 1 - excessSlip * 0.018;
        }

        // Environment friction check
        const distFromCenter = this.getDistanceFromCenterline(spline);
        if (distFromCenter > roadWidth / 2) {
          this.speed *= this.offRoadFriction;
          if (this.speed > 4.5 * GAME_BALANCE.speedScale) this.speed = 4.5 * GAME_BALANCE.speedScale;
        } else {
          this.speed *= this.friction;
        }

        // Cap speed
        if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
        if (this.speed < -this.maxSpeed * 0.4) this.speed = -this.maxSpeed * 0.4;

        const velocityAngle = this.angle + this.driftAngle;
        this.vx = Math.cos(velocityAngle) * this.speed;
        this.vy = Math.sin(velocityAngle) * this.speed;
        this.x += this.vx;
        this.y += this.vy;

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
        if (this.raceFinished) return;
        const previous = this.previousLapIndex;
        const current = this.currentSplineIndex;
        this.previousLapIndex = current;

        // Visit quarter-circuit checkpoints in order before accepting a finish.
        // This excludes the grid's initial line crossing and line oscillations.
        const checkpoint = Math.floor(len * this.nextLapCheckpoint / 4);
        if (this.nextLapCheckpoint <= 3 && current > previous
            && current - previous < len / 4
            && previous < checkpoint && current >= checkpoint) {
          this.nextLapCheckpoint++;
        }
        const crossedForward = previous > len * 0.75 && current < len * 0.25;
        if (crossedForward && this.nextLapCheckpoint === 4) {
          this.nextLapCheckpoint = 1;
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

      // Distance-based pursuit with a braking envelope for upcoming corners.
      computeAIInput(spline, roadWidth = 90, opponent = null) {
        const len = spline.length;
        this.getDistanceFromCenterline(spline);
        const lookahead = 32 + Math.abs(this.speed) * 6;
        const brakingDeceleration = this.brake * 0.85;
        const horizon = lookahead + this.maxSpeed ** 2 / (2 * brakingDeceleration) + 60;
        let target = spline[this.currentSplineIndex];
        let distance = 0;
        let targetFound = false;
        let targetSpeed = this.maxSpeed;
        let targetBend = 0;

        for (let step = 0; step < len && distance < horizon; step++) {
          const index = (this.currentSplineIndex + step) % len;
          const previous = spline[(index - 1 + len) % len];
          const point = spline[index];
          const next = spline[(index + 1) % len];
          const incoming = Math.hypot(point.x - previous.x, point.y - previous.y);
          const outgoing = Math.hypot(next.x - point.x, next.y - point.y);
          const headingIn = Math.atan2(point.y - previous.y, point.x - previous.x);
          const headingOut = Math.atan2(next.y - point.y, next.x - point.x);
          const bend = Math.abs(Math.atan2(Math.sin(headingOut - headingIn), Math.cos(headingOut - headingIn)));
          const signedBend = Math.atan2(Math.sin(headingOut - headingIn), Math.cos(headingOut - headingIn));
          const curvature = bend / Math.max((incoming + outgoing) / 2, 0.001);
          const cornerSpeed = Math.min(this.maxSpeed, this.turnRate * 0.82 / Math.max(curvature, 0.00001));
          // Brake early enough to reach each corner's steering-limited speed.
          const availableDistance = Math.max(0, distance - lookahead * 0.5);
          targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed ** 2 + 2 * brakingDeceleration * availableDistance));

          if (!targetFound && distance + outgoing >= lookahead) {
            const fraction = (lookahead - distance) / Math.max(outgoing, 0.001);
            const baseX = point.x + (next.x - point.x) * fraction;
            const baseY = point.y + (next.y - point.y) * fraction;
            // Clip toward the apex on meaningful bends for a faster, smoother racing line.
            const apexOffset = Math.sign(signedBend) * Math.min(roadWidth * 0.18, bend * roadWidth * 1.2);
            const segmentHeading = Math.atan2(next.y - point.y, next.x - point.x);
            target = {
              x: baseX - Math.sin(segmentHeading) * apexOffset,
              y: baseY + Math.cos(segmentHeading) * apexOffset
            };
            targetBend = signedBend;
            targetFound = true;
          }
          distance += outgoing;
        }

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const headingError = Math.atan2(Math.sin(Math.atan2(dy, dx) - this.angle), Math.cos(Math.atan2(dy, dx) - this.angle));
        const pursuitCurvature = 2 * Math.sin(headingError) / Math.max(Math.hypot(dx, dy), 1);
        let steer = Math.max(-1, Math.min(1, pursuitCurvature * Math.max(Math.abs(this.speed), 2) / this.turnRate));
        // Pick the open side instead of driving straight into the player.
        if (opponent && Math.hypot(opponent.x - this.x, opponent.y - this.y) < 75) {
          const relativeSide = Math.sin(this.angle) * (opponent.x - this.x) - Math.cos(this.angle) * (opponent.y - this.y);
          steer += relativeSide > 0 ? 0.22 : -0.22;
          steer = Math.max(-1, Math.min(1, steer));
        }
        // Recover after contact without charging away from the track.
        targetSpeed = Math.min(targetSpeed, this.turnRate * 0.9 / Math.max(Math.abs(pursuitCurvature), 0.00001));
        if (Math.abs(headingError) > 1) targetSpeed = Math.min(targetSpeed, 2);
        targetSpeed = Math.max(1.2, targetSpeed);
        const speedError = targetSpeed - this.speed;
        let throttle = speedError < -0.15
          ? Math.max(-1, speedError / this.brake)
          : Math.max(0, Math.min(1, (targetSpeed * (1 / this.friction - 1) + speedError * 0.5) / this.accel));
        const handbrake = Math.abs(targetBend) > 0.035
          && Math.abs(headingError) > 0.16
          && this.speed > this.maxSpeed * 0.72
          && targetSpeed < this.speed * 0.92;
        if (handbrake) throttle = Math.max(throttle, 0.25);
        return { steer, throttle, handbrake };
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
