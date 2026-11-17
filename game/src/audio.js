// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, gunshots, sirens, pickups and a slow synthwave loop.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngineLoop();
      this.startSirenLoop();
      this.startMusic();
      return true;
    } catch (_) {
      return false;
    }
  }

  startEngineLoop() {
    const c = this.ctx;
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = c.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 82;
    const g2 = c.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2);
    g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + 0.11 * speed01 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 48 + 130 * speed01;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(280 + 900 * speed01, t, 0.1);
  }

  startSirenLoop() {
    const c = this.ctx;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.55;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    lfo.start();
  }

  setSiren(on, near01) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.02 + 0.05 * near01 : 0, this.ctx.currentTime, 0.2);
  }

  blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    try {
      const c = this.ctx;
      const t = c.currentTime + when;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (_) {}
  }

  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx) return;
    try {
      const c = this.ctx;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      const g = c.createGain();
      g.gain.value = vol;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
    } catch (_) {}
  }

  shot() {
    this.noiseBurst(0.14, 0.5, 2400);
    this.blip(160, 0.08, 'square', 0.16);
  }
  punch() {
    this.noiseBurst(0.09, 0.35, 500);
  }
  pickup() {
    this.blip(660, 0.12, 'sine', 0.22);
    this.blip(990, 0.18, 'sine', 0.2, 0.09);
  }
  cash() {
    this.blip(880, 0.1, 'triangle', 0.2);
    this.blip(1174, 0.14, 'triangle', 0.2, 0.08);
    this.blip(1568, 0.22, 'triangle', 0.18, 0.16);
  }
  busted() {
    this.blip(220, 0.5, 'sawtooth', 0.2);
    this.blip(165, 0.6, 'sawtooth', 0.2, 0.15);
  }
  wasted() {
    this.blip(110, 0.9, 'sawtooth', 0.22);
    this.blip(82, 1.1, 'sawtooth', 0.2, 0.2);
  }

  startMusic() {
    // Slow synthwave: a 16-step bass line + soft pad chords, scheduled ahead.
    const bassNotes = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 73.42, 0];
    const chords = [
      [220, 261.63, 329.63],
      [196, 246.94, 293.66],
      [174.61, 220, 261.63],
      [196, 246.94, 329.63],
    ];
    const stepDur = 0.24;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const c = this.ctx;
      const now = c.currentTime + 0.05;
      const step = this.musicStep % 16;
      const bass = bassNotes[step];
      if (bass) {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = bass;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.11, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + stepDur * 1.8);
        o.connect(g);
        g.connect(this.master);
        o.start(now);
        o.stop(now + stepDur * 2);
      }
      if (step % 8 === 0) {
        const chord = chords[Math.floor(this.musicStep / 8) % chords.length];
        for (const f of chord) {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          const flt = c.createBiquadFilter();
          flt.type = 'lowpass';
          flt.frequency.value = 900;
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(0.028, now + 0.4);
          g.gain.setValueAtTime(0.028, now + stepDur * 7);
          g.gain.linearRampToValueAtTime(0.0001, now + stepDur * 8);
          o.connect(flt);
          flt.connect(g);
          g.connect(this.master);
          o.start(now);
          o.stop(now + stepDur * 8.2);
        }
      }
      this.musicStep++;
    }, stepDur * 1000);
  }
}
