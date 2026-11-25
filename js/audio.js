// Zero-dependency procedural Web Audio engine for Winterfoot
// Features a complete 32-bar multi-section Stardew-winter soundtrack
// (Intro -> Verse A -> Verse A' w/ Flute Harmony -> Nostalgic Chorus B -> Fireside Coda),
// warm filtered echo/reverb bus, subtle outdoor breeze / indoor hearth crackle ambience,
// and full farming/animal/indoor SFX.

// Musical note frequency table (D Major / B Minor cozy winter palette)
const N = {
  R: 0,
  D2: 73.42, E2: 82.41, Fs2: 92.50, G2: 98.00, A2: 110.00, B2: 123.47, Cs3: 138.59,
  D3: 146.83, E3: 164.81, Fs3: 185.00, G3: 196.00, A3: 220.00, B3: 246.94, Cs4: 277.18,
  D4: 293.66, E4: 329.63, Fs4: 369.99, G4: 392.00, A4: 440.00, B4: 493.88, Cs5: 554.37,
  D5: 587.33, E5: 659.25, Fs5: 739.99, G5: 783.99, A5: 880.00, B5: 987.77, Cs6: 1108.73, D6: 1174.66,
};

// 32-Bar Chord Progression (1 chord per bar, 8 eighth-note steps per bar = 256 steps total!)
const CHORDS = [
  // Intro (Bars 1-4): peaceful falling snow
  { bass: N.D2, arp: [N.D3, N.A3, N.D4, N.Fs4, N.A4, N.Fs4, N.D4, N.A3] },
  { bass: N.B2, arp: [N.B2, N.Fs3, N.B3, N.D4, N.Fs4, N.D4, N.B3, N.Fs3] },
  { bass: N.G2, arp: [N.G3, N.D4, N.G4, N.B4, N.D5, N.B4, N.G4, N.D4] },
  { bass: N.A2, arp: [N.A3, N.E4, N.A4, N.Cs5, N.E4, N.A4, N.G4, N.E4] },

  // Verse A (Bars 5-12): warm main winter cottage theme
  { bass: N.D2, arp: [N.D3, N.A3, N.D4, N.Fs4, N.A4, N.Fs4, N.D4, N.A3] },
  { bass: N.Cs3, arp: [N.A3, N.Cs4, N.E4, N.A4, N.E4, N.Cs4, N.A3, N.E3] },
  { bass: N.B2, arp: [N.B2, N.Fs3, N.B3, N.D4, N.Fs4, N.D4, N.B3, N.Fs3] },
  { bass: N.Fs2, arp: [N.Fs3, N.Cs4, N.Fs4, N.A4, N.Fs4, N.Cs4, N.A3, N.Fs3] },
  { bass: N.G2, arp: [N.G3, N.B3, N.D4, N.G4, N.B4, N.G4, N.D4, N.B3] },
  { bass: N.Fs2, arp: [N.D3, N.A3, N.D4, N.Fs4, N.A4, N.Fs4, N.D4, N.A3] },
  { bass: N.E2, arp: [N.E3, N.B3, N.E4, N.G4, N.B4, N.G4, N.E4, N.B3] },
  { bass: N.A2, arp: [N.A3, N.E4, N.G4, N.Cs5, N.A4, N.G4, N.E4, N.Cs4] },

  // Verse A' (Bars 13-20): main theme enriched with flute harmony
  { bass: N.D2, arp: [N.D3, N.A3, N.D4, N.Fs4, N.A4, N.Fs4, N.D4, N.A3] },
  { bass: N.Cs3, arp: [N.A3, N.Cs4, N.E4, N.A4, N.E4, N.Cs4, N.A3, N.E3] },
  { bass: N.B2, arp: [N.B2, N.Fs3, N.B3, N.D4, N.Fs4, N.D4, N.B3, N.Fs3] },
  { bass: N.Fs2, arp: [N.Fs3, N.Cs4, N.Fs4, N.A4, N.Fs4, N.Cs4, N.A3, N.Fs3] },
  { bass: N.G2, arp: [N.G3, N.B3, N.D4, N.G4, N.B4, N.G4, N.D4, N.B3] },
  { bass: N.A2, arp: [N.A3, N.E4, N.A4, N.Cs5, N.E5, N.Cs5, N.A4, N.E4] },
  { bass: N.D2, arp: [N.D3, N.A3, N.D4, N.Fs4, N.A4, N.D5, N.A4, N.Fs4] },
  { bass: N.D2, arp: [N.D3, N.A3, N.E4, N.Fs4, N.A4, N.Fs4, N.D4, N.A3] },

  // Chorus B (Bars 21-28): nostalgic winter valley lift
  { bass: N.G2, arp: [N.G3, N.D4, N.G4, N.B4, N.D5, N.B4, N.G4, N.D4] },
  { bass: N.A2, arp: [N.A3, N.E4, N.A4, N.Cs5, N.E5, N.Cs5, N.A4, N.E4] },
  { bass: N.Fs2, arp: [N.Fs3, N.Cs4, N.Fs4, N.A4, N.Cs5, N.A4, N.Fs4, N.Cs4] },
  { bass: N.B2, arp: [N.B2, N.Fs3, N.B3, N.D4, N.Fs4, N.D4, N.B3, N.Fs3] },
  { bass: N.E2, arp: [N.E3, N.B3, N.E4, N.G4, N.B4, N.G4, N.E4, N.B3] },
  { bass: N.A2, arp: [N.A3, N.E4, N.G4, N.Cs5, N.E5, N.Cs5, N.A4, N.E4] },
  { bass: N.D2, arp: [N.D3, N.A3, N.D4, N.Fs4, N.A4, N.Fs4, N.D4, N.A3] },
  { bass: N.B2, arp: [N.B2, N.Fs3, N.B3, N.D4, N.Fs4, N.D4, N.B3, N.Fs3] },

  // Fireside Coda (Bars 29-32): peaceful gentle cadence
  { bass: N.G2, arp: [N.G3, N.B3, N.D4, N.G4, N.B4, N.G4, N.D4, N.B3] },
  { bass: N.E2, arp: [N.E3, N.B3, N.E4, N.G4, N.B4, N.G4, N.E4, N.B3] },
  { bass: N.A2, arp: [N.A3, N.E4, N.G4, N.Cs5, N.A4, N.E4, N.G4, N.E4] },
  { bass: N.D2, arp: [N.D3, N.A3, N.D4, N.Fs4, N.A4, N.R, N.R, N.R] },
];

// 32-Bar Lead Celesta / Music-Box Melody (8 eighth-notes per bar)
const LEAD_MELODY = [
  // Intro (Bars 1-4): gentle crystalline snowdrop bells
  N.R, N.R, N.A5, N.R, N.Fs5, N.R, N.R, N.R,
  N.R, N.R, N.D5, N.R, N.Fs5, N.R, N.R, N.R,
  N.R, N.R, N.B5, N.R, N.A5, N.R, N.G5, N.R,
  N.E5, N.R, N.R, N.R, N.R, N.R, N.D5, N.E5,

  // Verse A (Bars 5-12)
  N.Fs5, N.R, N.A5, N.R, N.Fs5, N.E5, N.D5, N.R,
  N.E5, N.R, N.A5, N.R, N.E5, N.R, N.Cs5, N.R,
  N.D5, N.R, N.Fs5, N.R, N.B4, N.D5, N.Fs5, N.E5,
  N.Cs5, N.R, N.R, N.R, N.R, N.R, N.D5, N.E5,
  N.G5, N.R, N.B5, N.R, N.A5, N.G5, N.Fs5, N.R,
  N.Fs5, N.R, N.A5, N.R, N.D5, N.R, N.Fs5, N.R,
  N.E5, N.R, N.G5, N.Fs5, N.E5, N.D5, N.B4, N.R,
  N.Cs5, N.R, N.E5, N.R, N.A4, N.R, N.D5, N.E5,

  // Verse A' (Bars 13-20): expressive variation
  N.Fs5, N.R, N.A5, N.B5, N.A5, N.Fs5, N.D5, N.R,
  N.E5, N.R, N.A5, N.R, N.Cs6, N.B5, N.A5, N.R,
  N.Fs5, N.R, N.B5, N.R, N.A5, N.Fs5, N.D5, N.E5,
  N.Fs5, N.R, N.R, N.R, N.Cs5, N.R, N.D5, N.E5,
  N.G5, N.R, N.B5, N.R, N.D6, N.B5, N.A5, N.G5,
  N.E5, N.R, N.A5, N.R, N.G5, N.Fs5, N.E5, N.R,
  N.D5, N.R, N.Fs5, N.R, N.A5, N.R, N.D6, N.R,
  N.A5, N.R, N.R, N.R, N.R, N.R, N.Fs5, N.A5,

  // Chorus B (Bars 21-28): soaring heartfelt winter valley bridge
  N.B5, N.R, N.D6, N.R, N.B5, N.A5, N.G5, N.Fs5,
  N.E5, N.R, N.A5, N.R, N.Cs6, N.R, N.A5, N.R,
  N.A5, N.R, N.Cs6, N.R, N.B5, N.A5, N.Fs5, N.E5,
  N.D5, N.R, N.Fs5, N.R, N.B5, N.R, N.Fs5, N.R,
  N.G5, N.R, N.B5, N.R, N.A5, N.G5, N.E5, N.R,
  N.E5, N.R, N.A5, N.G5, N.Fs5, N.E5, N.Cs5, N.R,
  N.D5, N.Fs5, N.A5, N.R, N.D6, N.Cs6, N.B5, N.A5,
  N.Fs5, N.R, N.R, N.R, N.D5, N.R, N.E5, N.Fs5,

  // Fireside Coda (Bars 29-32): tender settling resolution
  N.G5, N.R, N.B5, N.R, N.A5, N.G5, N.Fs5, N.D5,
  N.E5, N.R, N.G5, N.R, N.Fs5, N.E5, N.D5, N.R,
  N.E5, N.R, N.Cs5, N.R, N.A4, N.R, N.E5, N.R,
  N.D5, N.R, N.Fs5, N.R, N.D6, N.R, N.R, N.R,
];

// Warm Flute / Ocarina Counter-Melody (enters gracefully during Verse A', Chorus B & Coda!)
const FLUTE_HARMONY = [
  // Bars 1-12: silent so the intro & first verse stay pure and intimate
  ...new Array(96).fill(N.R),

  // Verse A' (Bars 13-20): lyrical warm lower-third/sixth flute voice
  N.D5, N.R, N.R, N.R, N.A4, N.R, N.R, N.R,
  N.Cs5, N.R, N.R, N.R, N.E5, N.R, N.R, N.R,
  N.D5, N.R, N.R, N.R, N.Fs5, N.R, N.R, N.R,
  N.A4, N.R, N.Cs5, N.R, N.Fs4, N.R, N.R, N.R,
  N.B4, N.R, N.D5, N.R, N.G5, N.R, N.R, N.R,
  N.Cs5, N.R, N.E5, N.R, N.Cs5, N.R, N.A4, N.R,
  N.A4, N.R, N.D5, N.R, N.Fs5, N.R, N.R, N.R,
  N.Fs5, N.R, N.E5, N.R, N.D5, N.R, N.R, N.R,

  // Chorus B (Bars 21-28): rich expressive flute lines
  N.G5, N.R, N.R, N.R, N.D5, N.R, N.B4, N.R,
  N.Cs5, N.R, N.E5, N.R, N.A5, N.R, N.E5, N.R,
  N.Fs5, N.R, N.R, N.R, N.Cs5, N.R, N.A4, N.R,
  N.B4, N.R, N.D5, N.R, N.Fs5, N.R, N.D5, N.R,
  N.E5, N.R, N.G5, N.R, N.E5, N.R, N.B4, N.R,
  N.Cs5, N.R, N.E5, N.R, N.A4, N.R, N.R, N.R,
  N.Fs5, N.R, N.R, N.R, N.A5, N.R, N.Fs5, N.R,
  N.D5, N.R, N.R, N.R, N.B4, N.R, N.R, N.R,

  // Coda (Bars 29-32): gentle breathing farewell
  N.B4, N.R, N.D5, N.R, N.R, N.R, N.B4, N.R,
  N.G4, N.R, N.B4, N.R, N.R, N.R, N.G4, N.R,
  N.A4, N.R, N.R, N.R, N.E4, N.R, N.G4, N.R,
  N.Fs4, N.R, N.A4, N.R, N.Fs5, N.R, N.R, N.R,
];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.schedulerTimer = null;
    this.ambienceTimer = null;
    this.stepIdx = 0;
    this.nextNoteTime = 0;
    this.stepDuration = 0.41; // ~73 BPM cozy winter eighth-note pulse
    this.isIndoor = false;
    this.initialized = false;
    this.snowLevel = 1;
    this.wind = null;
  }

  unlock() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === "suspended" && !this.pageHidden) this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    const now = this.ctx.currentTime;

    // Master bus with gentle fade-in
    this.master = this.ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0.0001 : 0.46, now + 0.6);
    this.master.connect(this.ctx.destination);

    // Dedicated BGM tone-shaping lowpass filter (shifts warmly when entering cabin!)
    this.bgmBus = this.ctx.createGain();
    this.bgmBus.gain.value = 0.78;
    this.bgmFilter = this.ctx.createBiquadFilter();
    this.bgmFilter.type = "lowpass";
    this.bgmFilter.frequency.value = this.isIndoor ? 2900 : 6200;
    this.bgmFilter.Q.value = 0.7;

    // Lush Stereo-Feel Winter Echo / Reverb Send Bus
    this.reverbIn = this.ctx.createGain();
    this.reverbIn.gain.value = 0.38;
    const delayA = this.ctx.createDelay(1.0);
    delayA.delayTime.value = 0.31;
    const delayB = this.ctx.createDelay(1.0);
    delayB.delayTime.value = 0.47;
    const revFilter = this.ctx.createBiquadFilter();
    revFilter.type = "lowpass";
    revFilter.frequency.value = 2100;
    const fbA = this.ctx.createGain();
    fbA.gain.value = 0.32;
    const fbB = this.ctx.createGain();
    fbB.gain.value = 0.28;

    this.reverbIn.connect(delayA);
    this.reverbIn.connect(delayB);
    delayA.connect(revFilter);
    delayB.connect(revFilter);
    revFilter.connect(fbA);
    fbA.connect(delayB);
    revFilter.connect(fbB);
    fbB.connect(delayA);
    revFilter.connect(this.bgmFilter);

    this.bgmBus.connect(this.bgmFilter);
    this.bgmBus.connect(this.reverbIn);
    this.bgmFilter.connect(this.master);

    this.initialized = true;
    this.nextNoteTime = now + 0.12;
    this._startMusicScheduler();
    this._startAmbienceLoop();
    this._startWind();
  }

  // Page hidden (phone switched apps / tab in background): silence everything, resume on return
  setPageHidden(hidden) {
    this.pageHidden = hidden;
    if (!this.ctx) return;
    if (hidden) {
      if (this.ctx.state === "running") this.ctx.suspend();
    } else if (this.ctx.state === "suspended") {
      this.ctx.resume();
      // skip any notes that piled up while suspended
      this.nextNoteTime = this.ctx.currentTime + 0.1;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0.0001 : 0.46, this.ctx.currentTime, 0.06);
    }
  }

  // Weather: 0 = clear, 1 = light snow, 2 = heavy snow (drives the wind bed)
  setWeather(level) {
    this.snowLevel = level;
    this._applyWind(1.6);
  }

  // Continuous wind: looping filtered noise whose loudness follows the snowfall,
  // muffled behind the cabin walls when indoors.
  _startWind() {
    if (this.wind || !this.ctx) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // brown-ish noise: smoother, more like air than hiss
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985;
      d[i] = last * 3.2;
    }
    // crossfade the loop seam
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = (len - fade) / ctx.sampleRate;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 520;
    band.Q.value = 0.55;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = this.isIndoor ? 420 : 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(band);
    band.connect(low);
    low.connect(gain);
    gain.connect(this.master);
    src.start();
    this.wind = { src, band, low, gain };
    this._applyWind(2.5);
  }

  _windTarget() {
    const base = [0.01, 0.028, 0.11][this.snowLevel] ?? 0.028;
    return this.isIndoor ? base * 0.35 : base;
  }

  _applyWind(seconds = 1.2) {
    if (!this.wind || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(this._windTarget(), now, seconds / 3);
    this.wind.low.frequency.setTargetAtTime(this.isIndoor ? 420 : 1800, now, 0.3);
  }

  setIndoor(indoor) {
    this.isIndoor = indoor;
    this._applyWind(0.6);
    if (this.bgmFilter && this.ctx) {
      // Smoothly warm up the acoustic timbre when stepping inside the wooden cabin!
      this.bgmFilter.frequency.setTargetAtTime(indoor ? 2900 : 6200, this.ctx.currentTime, 0.25);
    }
  }

  _startMusicScheduler() {
    if (this.schedulerTimer) return;
    // Accurate Web Audio lookahead scheduler (eliminates setInterval rhythm jitter!)
    this.schedulerTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== "running") return;
      const lookahead = 0.2;
      if (this.nextNoteTime < this.ctx.currentTime - 0.5) {
        this.nextNoteTime = this.ctx.currentTime + 0.05;
      }
      while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
        this._scheduleStep(this.stepIdx, this.nextNoteTime);
        this.stepIdx = (this.stepIdx + 1) % LEAD_MELODY.length;
        this.nextNoteTime += this.stepDuration;
      }
    }, 55);
  }

  _scheduleStep(step, t) {
    if (this.muted) return;
    const barIdx = Math.floor(step / 8);
    const beatInBar = step % 8;
    const chord = CHORDS[barIdx % CHORDS.length];

    // 1. Acoustic Guitar / Winter Harp Rolling Arpeggio
    const arpFreq = chord.arp[beatInBar];
    if (arpFreq > 0) {
      const accent = beatInBar === 0 ? 1.15 : beatInBar === 4 ? 1.0 : 0.82;
      this._playHarpPluck(arpFreq, t, 0.048 * accent, 1.05);
    }

    // 2. Warm Sustained Upright Cello / Pad Bass on Bar Downbeats (and gentle half-bar breath)
    if (beatInBar === 0 && chord.bass > 0) {
      this._playWarmBass(chord.bass, t, 0.09, this.stepDuration * 7.6);
    }

    // 3. Lead Celesta / Cozy Winter Music Box
    const leadFreq = LEAD_MELODY[step];
    if (leadFreq > 0) {
      const isStrong = beatInBar === 0 || beatInBar === 4;
      this._playCelesta(leadFreq, t, isStrong ? 0.095 : 0.078, 1.45);
    }

    // 4. Lyrical Breathy Wooden Flute Counter-Melody (Verse A', Chorus B, Coda)
    const fluteFreq = FLUTE_HARMONY[step];
    if (fluteFreq > 0) {
      this._playWarmFlute(fluteFreq, t, 0.052, this.stepDuration * 3.4);
    }

    // 5. Delicate Snow-Bell Shimmer on Chorus Downbeats (Bars 21-28)
    if (barIdx >= 20 && barIdx <= 27 && beatInBar === 0 && leadFreq > 0) {
      this._playCelesta(leadFreq * 2, t + 0.015, 0.022, 1.9);
    }
  }

  _playCelesta(freq, t, vol, dur) {
    // Warm fundamental + gentle glassy 2nd harmonic shimmer
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc1.type = this.isIndoor ? "triangle" : "sine";
    osc1.frequency.setValueAtTime(freq, t);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq * 2, t);

    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(this.isIndoor ? 0.14 : 0.24, t);
    g2.gain.exponentialRampToValueAtTime(0.01, t + dur * 0.45);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);

    osc1.connect(g);
    osc2.connect(g2);
    g2.connect(g);
    g.connect(this.bgmBus);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + dur + 0.04);
    osc2.stop(t + dur + 0.04);
  }

  _playHarpPluck(freq, t, vol, dur) {
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);

    flt.type = "lowpass";
    flt.frequency.setValueAtTime(freq * 4.2, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(320, freq * 1.4), t + dur * 0.65);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(this.bgmBus);

    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  _playWarmBass(freq, t, vol, dur) {
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);

    flt.type = "lowpass";
    flt.frequency.setValueAtTime(420, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.14);
    g.gain.setValueAtTime(vol * 0.85, t + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(this.bgmBus);

    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _playWarmFlute(freq, t, vol, dur) {
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);

    // Gentle acoustic flute vibrato
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(5.0, t);
    lfoGain.gain.setValueAtTime(freq * 0.006, t);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    flt.type = "lowpass";
    flt.frequency.setValueAtTime(1850, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.18);
    g.gain.setValueAtTime(vol * 0.85, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(this.bgmBus);

    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  _startAmbienceLoop() {
    if (this.ambienceTimer) return;
    // Ultra-subtle cozy environment bed: soft hearth pops indoors, whisper winter breeze outdoors
    this.ambienceTimer = setInterval(() => {
      if (!this.ctx || this.muted || this.ctx.state !== "running") return;
      // Wind gusts: in heavy snow the wind swells and whistles now and then
      if (this.wind && Math.random() < (this.snowLevel === 2 ? 0.22 : 0.08)) {
        const now = this.ctx.currentTime;
        const swell = this.snowLevel === 2 ? 1.4 + Math.random() * 0.9 : 1.2 + Math.random() * 0.5;
        this.wind.gain.gain.setTargetAtTime(this._windTarget() * swell, now, 0.5);
        this.wind.gain.gain.setTargetAtTime(this._windTarget(), now + 1.4 + Math.random(), 0.9);
        this.wind.band.frequency.setTargetAtTime(380 + Math.random() * 520, now, 0.8);
      }
      if (this.isIndoor) {
        if (Math.random() < 0.55) {
          this._noise(0.032, 2400 + Math.random() * 1400, 0.018 + Math.random() * 0.015);
        }
      } else {
        if (Math.random() < 0.28) {
          this._noise(1.1, 420 + Math.random() * 240, 0.012);
        }
      }
    }, 340);
  }

  _tone(freq, dur, type = "sine", vol = 0.14, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  _noise(dur, filterFreq, vol = 0.09) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const len = Math.max(16, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = "bandpass";
    flt.frequency.setValueAtTime(filterFreq, now);
    flt.Q.value = 1.4;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0005, now);
    g.gain.linearRampToValueAtTime(vol, now + Math.min(0.08, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    src.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    src.start(now);
  }

  footstep(indoor = false) {
    if (indoor) {
      this._tone(125 + Math.random() * 20, 0.06, "triangle", 0.08, 70);
    } else {
      this._noise(0.07, 1750 + Math.random() * 450, 0.065);
    }
  }

  hoeTill() {
    this._tone(160, 0.11, "triangle", 0.16, 75);
    this._noise(0.1, 650, 0.11);
  }

  plantSeed() {
    this._tone(420, 0.08, "sine", 0.12, 540);
    setTimeout(() => this._tone(580, 0.08, "sine", 0.1, 680), 55);
  }

  waterSplash() {
    this._noise(0.18, 1200, 0.11);
    this._tone(520, 0.12, "sine", 0.09, 860);
  }

  harvestPop() {
    this._tone(460, 0.09, "triangle", 0.16, 740);
    setTimeout(() => this._tone(880, 0.14, "sine", 0.15, 1080), 65);
  }

  coinChime() {
    this._tone(987.77, 0.12, "sine", 0.15);
    setTimeout(() => this._tone(1318.5, 0.24, "sine", 0.16), 85);
  }

  treeShake() {
    this._noise(0.28, 900, 0.13);
    this._tone(190, 0.16, "triangle", 0.08, 120);
  }

  woodPickup() {
    this._tone(310, 0.07, "square", 0.06, 440);
  }

  rabbitSqueak() {
    this._tone(820, 0.08, "sine", 0.13, 1140);
    setTimeout(() => this._tone(960, 0.1, "sine", 0.12, 1320), 85);
  }

  doorCreak() {
    this._tone(185, 0.18, "sawtooth", 0.055, 250);
    setTimeout(() => this._tone(130, 0.12, "triangle", 0.1, 90), 160);
  }

  fireStoke() {
    this._noise(0.22, 1100, 0.1);
    this._tone(340, 0.18, "triangle", 0.11, 520);
  }

  sheepBaa() {
    this._tone(390, 0.14, "triangle", 0.11, 330);
    setTimeout(() => this._tone(340, 0.16, "triangle", 0.09, 285), 110);
  }

  chickenCluck() {
    this._tone(740, 0.06, "triangle", 0.11, 980);
    setTimeout(() => this._tone(680, 0.07, "triangle", 0.1, 860), 75);
    setTimeout(() => this._tone(820, 0.08, "sine", 0.09, 640), 155);
  }

  cowMoo() {
    this._tone(195, 0.34, "sawtooth", 0.055, 155);
    this._tone(295, 0.28, "triangle", 0.06, 230);
  }

  catPurr() {
    this._tone(580, 0.12, "sine", 0.09, 760);
    setTimeout(() => this._tone(660, 0.14, "sine", 0.08, 560), 120);
  }

  hayRustle() {
    this._noise(0.2, 1600, 0.09);
    this._tone(420, 0.08, "sine", 0.08, 560);
  }

  sipWarm() {
    this._tone(520, 0.11, "sine", 0.1, 690);
    setTimeout(() => this._tone(780, 0.16, "sine", 0.1, 980), 95);
  }

  giftOpen() {
    const notes = [587.33, 739.99, 880.0, 1174.66];
    notes.forEach((f, idx) => {
      setTimeout(() => this._tone(f, 0.22, "triangle", 0.13), idx * 70);
    });
  }

  letterOpen() {
    this._noise(0.16, 1850, 0.08);
    setTimeout(() => this._tone(587.33, 0.22, "sine", 0.1), 50);
    setTimeout(() => this._tone(880.0, 0.3, "sine", 0.09), 150);
  }

  crabClack() {
    this._tone(680, 0.055, "square", 0.065, 920);
    setTimeout(() => this._tone(820, 0.065, "square", 0.065, 1180), 80);
    setTimeout(() => this._tone(1046.5, 0.16, "triangle", 0.11), 165);
  }

  // ================= 🎂 Birthday SFX =================

  // Soft Stardew-like text blip while dialogue types out
  dialogueBlip() {
    if (!this.ctx || this.muted) return;
    const f = 620 + Math.random() * 90;
    this._tone(f, 0.045, "triangle", 0.035);
  }

  paperRustle() {
    this._noise(0.12, 2600, 0.05);
  }

  sealCrack() {
    this._noise(0.08, 900, 0.12);
    setTimeout(() => this._noise(0.18, 2200, 0.07), 90);
    setTimeout(() => this._tone(784, 0.25, "sine", 0.08), 260);
  }

  wrapTear() {
    this._noise(0.22, 3200, 0.1);
    setTimeout(() => this._tone(880, 0.12, "triangle", 0.09), 160);
    setTimeout(() => this._tone(1174.66, 0.2, "triangle", 0.09), 250);
  }

  questDone() {
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.18, "triangle", 0.1), i * 85);
    });
  }

  candleBlow() {
    this._noise(0.55, 1400, 0.13);
    setTimeout(() => this._noise(0.35, 700, 0.06), 180);
  }

  fireworkLaunch() {
    this._tone(380, 0.5, "sine", 0.035, 1400);
  }

  fireworkPop() {
    this._noise(0.3, 1100 + Math.random() * 900, 0.13);
    setTimeout(() => this._noise(0.5, 4200, 0.04), 60);
  }

  // --- 3D world fireworks: light arrives first, the boom follows (distance-based delay) ---
  _fwNoise(t, dur, type, freq, vol, q = 0.8) {
    const len = Math.max(16, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(freq, t);
    flt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    if (this.reverbIn) g.connect(this.reverbIn);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // Soft glassy shimmer for a shooting star
  shootingStar(indoor = false) {
    if (!this.ctx || this.muted || this.pageHidden) return;
    const notes = [1567.98, 2093.0, 2637.02, 3135.96];
    const v = indoor ? 0.02 : 0.03;
    notes.forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.5, "sine", v * (1 - i * 0.15)), i * 120);
    });
  }

  fireworkWhistle(dist = 60, indoor = false) {
    if (!this.ctx || this.muted || this.pageHidden) return;
    const far = Math.min(1, dist / 90);
    const vol = (indoor ? 0.008 : 0.02) * (1.1 - far * 0.7);
    const t = this.ctx.currentTime + dist / 140;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(900 + Math.random() * 300, t);
    osc.frequency.exponentialRampToValueAtTime(2200 + Math.random() * 600, t + 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 1.0);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.05);
  }

  fireworkBoom(dist = 60, indoor = false, crackle = false) {
    if (!this.ctx || this.muted || this.pageHidden) return;
    const far = Math.min(1, dist / 90);
    // Exaggerated speed of sound so the delay is noticeable but not annoying
    const t = this.ctx.currentTime + 0.12 + dist / 140;
    const loud = (indoor ? 0.45 : 1) * (1.15 - far * 0.65);
    const cut = (indoor ? 520 : 1400) * (1.2 - far * 0.6);
    // body of the boom (low, muffled with distance)
    this._fwNoise(t, 1.1 + far * 0.6, "lowpass", cut, 0.2 * loud, 0.7);
    // chest thump
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(85, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * loud, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 0.55);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);
    // crackling tail for glitter / willow shells
    if (crackle && !indoor) {
      for (let i = 0; i < 14; i++) {
        this._fwNoise(t + 0.5 + Math.random() * 1.3, 0.03, "bandpass", 2600 + Math.random() * 2400, 0.035 * loud, 2);
      }
    }
  }

  // Temporarily lower the background score (e.g. while the birthday song plays)
  duckMusic(amount = 0.12, seconds = 0) {
    if (!this.ctx || !this.bgmBus) return;
    const now = this.ctx.currentTime;
    this.bgmBus.gain.setTargetAtTime(amount, now, 0.25);
    if (seconds > 0) {
      this.bgmBus.gain.setTargetAtTime(0.78, now + seconds, 0.8);
    }
  }

  // Public-domain "Happy Birthday" melody on a music-box celesta voice. Returns duration (s).
  playBirthdaySong() {
    if (!this.ctx) return 0;
    const G4 = 392.0, A4 = 440.0, B4 = 493.88, C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99;
    const C3 = 130.81, G2 = 98.0, F2 = 87.31;
    const beat = 0.46;
    // [freq, beats, bass]
    const song = [
      [G4, 0.75], [G4, 0.25], [A4, 1, C3], [G4, 1], [C5, 1], [B4, 2, G2],
      [G4, 0.75], [G4, 0.25], [A4, 1, G2], [G4, 1], [D5, 1], [C5, 2, C3],
      [G4, 0.75], [G4, 0.25], [G5, 1, C3], [E5, 1], [C5, 1], [B4, 1, F2], [A4, 2],
      [F5, 0.75], [F5, 0.25], [E5, 1, C3], [C5, 1], [D5, 1, G2], [C5, 3, C3],
    ];
    const out = this.ctx.createGain();
    out.gain.value = this.muted ? 0 : 1;
    out.connect(this.master);
    out.connect(this.reverbIn);
    let t = this.ctx.currentTime + 0.15;
    for (const [freq, beats, bass] of song) {
      const dur = beats * beat;
      this._musicBoxNote(out, freq, t, 0.16, Math.max(0.5, dur * 1.6));
      this._musicBoxNote(out, freq * 2, t, 0.03, 0.4);
      if (bass) this._musicBoxNote(out, bass * 2, t, 0.08, dur * 2.2, "sine");
      t += dur;
    }
    const total = t - this.ctx.currentTime;
    this.duckMusic(0.1, total + 0.4);
    return total;
  }

  _musicBoxNote(dest, freq, t, vol, dur, type = "triangle") {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
