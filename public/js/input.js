    // Input Manager (Keyboard + Gamepad)
    class InputManager {
      constructor() {
        this.keys = {};
        window.addEventListener('keydown', e => {
          if (e.code === 'Escape' || isGamePaused) return;
          this.keys[e.code] = true;
          audio.init();
        });
        window.addEventListener('keyup', e => {
          this.keys[e.code] = false;
        });
      }
      getState() {
        let throttle = 0;
        let steer = 0;
        let handbrake = false;

        // Keyboard
        if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) throttle -= 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) steer += 1;
        if (this.keys['Space']) handbrake = true;

        // Controller support
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0] || gamepads[1];
        if (gp) {
          // Axis 0 = Left Stick Horizontal
          if (Math.abs(gp.axes[0]) > 0.15) steer = gp.axes[0];
          // Triggers: Button 7 (RT), Button 6 (LT)
          const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
          const lt = gp.buttons[6] ? gp.buttons[6].value : 0;
          if (rt > 0.1) throttle += rt;
          if (lt > 0.1) throttle -= lt;

          // Face buttons fallback (A: Gas, X/B: Brake)
          if (gp.buttons[0] && gp.buttons[0].pressed) throttle = 1;
          if (gp.buttons[2] && gp.buttons[2].pressed) throttle = -1;
          if (gp.buttons[1] && gp.buttons[1].pressed) handbrake = true;
        }

        return {
          throttle: Math.max(-1, Math.min(1, throttle)),
          steer: Math.max(-1, Math.min(1, steer)),
          handbrake
        };
      }
    }
    const input = new InputManager();
