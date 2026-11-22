// audio.js — every sound is synthesised; there are no audio files. Four
// persistent voices run under a master gain: a two-oscillator engine whose
// pitch tracks speed, an LFO-wailed siren, filtered noise that reads as
// surf near the beach, and a slow synthwave loop. Everything else — shots,
// punches, pickups, horns, jingles — is a one-shot blip or noise burst.
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
    this.ambienceGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.enabled = true;
  }

  // Create the context on first user gesture (browsers require one) and
  // start the persistent voices. Safe to call repeatedly.
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
      this.buildEngine();
      this.buildSiren();
      this.buildSurf();
      this.startMusic();
      return true;
    } catch {
      return false;
    }
  }

  buildEngine() {
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
    const sub = c.createGain();
    sub.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(sub);
    sub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + 0.11 * speed01 : 0, t, 0.08);
    const base = 48 + 130 * speed01;
    this.engineOsc.frequency.setTargetAtTime(base, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(base * 1.5, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(280 + 900 * speed01, t, 0.1);
  }

  buildSiren() {
    const c = this.ctx;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0;
    const wail = c.createOscillator();
    wail.frequency.value = 0.55;
    const wailDepth = c.createGain();
    wailDepth.gain.value = 220;
    wail.connect(wailDepth);
    wailDepth.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    wail.start();
  }

  setSiren(on, near01) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.02 + 0.05 * near01 : 0, this.ctx.currentTime, 0.2);
  }

  buildSurf() {
    // Pinkish noise — white noise integrated so it rumbles — looped under
    // a lowpass whose cutoff breathes on a slow LFO: waves arriving in sets.
    const c = this.ctx;
    const len = c.sampleRate * 3;
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.94 + (Math.random() * 2 - 1) * 0.06;
      data[i] = last * 6;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const swell = c.createOscillator();
    swell.frequency.value = 0.09;
    const swellDepth = c.createGain();
    swellDepth.gain.value = 190;
    swell.connect(swellDepth);
    swellDepth.connect(filter.frequency);
    this.ambienceGain = c.createGain();
    this.ambienceGain.gain.value = 0;
    src.connect(filter);
    filter.connect(this.ambienceGain);
    this.ambienceGain.connect(this.master);
    src.start();
    swell.start();
  }

  setAmbience(near01) {
    if (!this.ctx || !this.ambienceGain) return;
    this.ambienceGain.gain.setTargetAtTime(0.14 * near01, this.ctx.currentTime, 0.4);
  }

  // -- one-shot primitives ---------------------------------------------------
  blip(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!this.ctx) return;
    try {
      const c = this.ctx;
      const t = c.currentTime + delay;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // a failed one-shot must never take the game down with it
    }
  }

  noiseBurst(dur, vol, cutoff) {
    if (!this.ctx) return;
    try {
      const c = this.ctx;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = c.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start();
    } catch {
      // as above: sound effects are best-effort
    }
  }

  // -- the named effects -------------------------------------------------------
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

  horn() {
    // Two-tone and short: a car horn, not a melody.
    this.blip(370, 0.22, 'square', 0.14);
    this.blip(466, 0.22, 'square', 0.12);
  }

  collect() {
    // The shell chime: a glassy rising arpeggio, brighter than a pickup.
    this.blip(1318, 0.1, 'sine', 0.18);
    this.blip(1760, 0.12, 'sine', 0.16, 0.06);
    this.blip(2349, 0.2, 'sine', 0.14, 0.12);
  }

  countdown() {
    // Three low beeps and a high go-beep for the street-race start.
    this.blip(440, 0.14, 'square', 0.16);
    this.blip(440, 0.14, 'square', 0.16, 0.35);
    this.blip(440, 0.14, 'square', 0.16, 0.7);
    this.blip(880, 0.34, 'square', 0.18, 1.05);
  }

  fareDone() {
    // Ka-ching plus a two-note cab jingle.
    this.noiseBurst(0.05, 0.18, 5200);
    this.blip(784, 0.1, 'triangle', 0.2, 0.02);
    this.blip(1046, 0.16, 'triangle', 0.2, 0.1);
  }

  districtChime() {
    // A soft two-note motif for crossing into a new quarter.
    this.blip(587, 0.16, 'sine', 0.1);
    this.blip(880, 0.24, 'sine', 0.09, 0.12);
  }

  busted() {
    this.blip(220, 0.5, 'sawtooth', 0.2);
    this.blip(165, 0.6, 'sawtooth', 0.2, 0.15);
  }

  wasted() {
    this.blip(110, 0.9, 'sawtooth', 0.22);
    this.blip(82, 1.1, 'sawtooth', 0.2, 0.2);
  }

  // -- the synthwave loop --------------------------------------------------------
  startMusic() {
    // A 16-step bass pattern under pad chords that change every 8 steps.
    // Notes are scheduled a hair ahead of the interval tick.
    const bassLine = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 73.42, 0];
    const chordSet = [
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
      const bass = bassLine[step];
      if (bass) {
        const osc = c.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = bass;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.11, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + stepDur * 1.8);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + stepDur * 2);
      }
      if (step % 8 === 0) {
        const chord = chordSet[Math.floor(this.musicStep / 8) % chordSet.length];
        for (const freq of chord) {
          const osc = c.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = freq;
          const filter = c.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 900;
          const gain = c.createGain();
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(0.028, now + 0.4);
          gain.gain.setValueAtTime(0.028, now + stepDur * 7);
          gain.gain.linearRampToValueAtTime(0.0001, now + stepDur * 8);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.master);
          osc.start(now);
          osc.stop(now + stepDur * 8.2);
        }
      }
      this.musicStep++;
    }, stepDur * 1000);
  }
}
