    // Menu polling stays alive while the race animation is paused or stopped.
    class ControllerMenus {
      constructor() {
        this.previous = {};
        this.direction = null;
        this.repeatAt = 0;
        this.context = '';
        this.focused = null;
      }

      start() {
        this.timer = setInterval(() => this.update(performance.now()), 16);
        window.addEventListener('pointerdown', () => this.clearFocus());
        window.addEventListener('keydown', () => this.clearFocus());
      }

      clearFocus() {
        this.focused?.classList.remove('controller-focus');
        this.focused = null;
      }

      focus(element) {
        this.clearFocus();
        if (!element) return;
        this.focused = element;
        element.classList.add('controller-focus');
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: 'nearest' });
      }

      update(now) {
        const pad = getConnectedGamepad();
        if (!pad) {
          this.previous = {};
          this.direction = null;
          this.context = '';
          this.clearFocus();
          return;
        }
        const pressed = index => !!pad.buttons[index]?.pressed;
        const buttons = { accept: pressed(0), back: pressed(1), start: pressed(9) };
        const fresh = key => buttons[key] && !this.previous[key];
        const accept = fresh('accept'), back = fresh('back'), start = fresh('start');
        this.previous = buttons;
        const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
        const direction = pressed(12) ? 'up' : pressed(13) ? 'down'
          : pressed(14) ? 'left' : pressed(15) ? 'right'
          : Math.max(Math.abs(x), Math.abs(y)) < 0.55 ? null
          : Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
        const moved = direction && (direction !== this.direction || now >= this.repeatAt);
        if (direction !== this.direction) this.repeatAt = now + 350;
        else if (moved) this.repeatAt = now + 140;
        this.direction = direction;

        // Observe releases but never activate menus in a background window.
        if (document.hidden || !document.hasFocus()) return;
        if (isGameRunning && !isGamePaused) {
          this.context = 'racing';
          this.clearFocus();
          if (start) pauseRace();
          return;
        }

        const visible = element => element && element.getClientRects().length > 0;
        const warning = document.getElementById('collisionWarning');
        const scope = isGamePaused ? document.getElementById('pauseMenu')
          : visible(warning) ? warning : document.querySelector('.screen.active');
        if (!scope) return;
        const items = [...scope.querySelectorAll('button, input')].filter(element => !element.disabled && visible(element));
        const context = scope.id + ':' + items.map(element => element.id || element.textContent).join('|');
        if (context !== this.context) {
          this.context = context;
          this.repeatAt = now + 350;
          this.clearFocus();
        }
        if (start || back) {
          if (isGamePaused) {
            if (back) backFromPauseMenu();
            else resumeRace();
          }
          else if (scope === warning && back) document.getElementById('btnCancelOverwrite').click();
          else if (scope.id === 'startScreen' && start) document.getElementById('btnStartGame').click();
          else if (scope.id === 'leaderboardScreen') {
            document.getElementById(back ? 'btnReturnMenu' : 'btnRestartRace').click();
          }
          return;
        }
        if (!items.length || (!moved && !accept)) return;
        let index = items.indexOf(document.activeElement);
        if (index < 0) index = Math.max(0, items.findIndex(element => element.classList.contains('selected')));
        if (moved) {
          let step = direction === 'up' || direction === 'left' ? -1 : 1;
          if (scope.id === 'startScreen' && (direction === 'up' || direction === 'down')) {
            step *= 3;
            index = Math.max(0, Math.min(items.length - 1, index + step));
          } else {
            index = (index + step + items.length) % items.length;
          }
        }
        this.focus(items[index]);
        // Directional circuit navigation also updates the preview/selected circuit.
        if (items[index].classList.contains('track-btn')) items[index].click();
        else if (accept) items[index].click();
      }
    }
