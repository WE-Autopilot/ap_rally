    // Audio Synthesizer (Zero asset dependencies)
    class SoundEngine {
      constructor() {
        this.ctx = null;
        this.engineOsc = null;
        this.engineGain = null;
      }
      init() {
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          this.ctx = new AudioContext();
          this.engineOsc = this.ctx.createOscillator();
          this.engineGain = this.ctx.createGain();
          this.engineOsc.type = 'sawtooth';
          this.engineGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
          this.engineOsc.connect(this.engineGain);
          this.engineGain.connect(this.ctx.destination);
          this.engineOsc.start();
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      }
      updateEngine(speed, maxSpeed) {
        if (!this.ctx || !this.engineOsc) return;
        const norm = Math.min(1, Math.abs(speed) / maxSpeed);
        const freq = 45 + norm * 140;
        this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
        this.engineGain.gain.setTargetAtTime(0.03 + norm * 0.04, this.ctx.currentTime, 0.05);
      }
      stopEngine() {
        if (this.engineGain && this.ctx) {
          this.engineGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
        }
      }
      playThud() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(90, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.08);
        g.gain.setValueAtTime(0.35, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.1);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
      }
    }
    const audio = new SoundEngine();

