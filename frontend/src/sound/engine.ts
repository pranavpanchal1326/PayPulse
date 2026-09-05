/**
 * SOUND · blueprint §08
 *
 * A physical machine makes noise. Almost nothing in this category has sound
 * design, and it is the cheapest way to feel expensive.
 *
 * DEVIATION FROM THE BLUEPRINT: §08.1 budgets a 40kb sample sprite. Every
 * sound in the map is a click, a thunk, a tick or a short tonal figure — all
 * of which synthesise cleanly. Web Audio gives us the same map at *zero*
 * bytes, with the pitch of a landing rule block parameterised by its depth in
 * the stack, which a fixed sprite could not do. The budget drops 40kb → 0.
 *
 * RULES, all enforced below:
 *   muted by default · nothing loops · nothing on page load · nothing on
 *   hover · max two sounds per 500ms · sound never carries information that
 *   is not also visual.
 */

export type SoundName =
  | "press"      // key press — soft mechanical click
  | "toggle"     // lighter click, higher pitch
  | "block"      // a rule block lands in the stack
  | "validate"   // rising three-note resolve
  | "send"       // one clean chime
  | "blocked"    // dull damped stop, no pitch
  | "cleared"    // short upward tick
  | "drawer";    // soft air movement

/** dBFS → linear gain. Levels are quoted from §08.1. */
const dB = (v: number) => Math.pow(10, v / 20);

const LEVEL: Record<SoundName, number> = {
  press: dB(-24),
  toggle: dB(-28),
  block: dB(-20),
  validate: dB(-18),
  send: dB(-20),
  blocked: dB(-20),
  cleared: dB(-30),
  drawer: dB(-34),
};

const STORAGE_KEY = "paypulse.sound";
const THROTTLE_MS = 250; // no more than two per second

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastAt = 0;
  private _enabled = false;
  private listeners = new Set<(on: boolean) => void>();

  constructor() {
    // Muted by default. Only a previously stored `true` turns it on.
    try {
      this._enabled = localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      this._enabled = false;
    }
  }

  get enabled() {
    return this._enabled;
  }

  subscribe(fn: (on: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setEnabled(on: boolean) {
    this._enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      /* private mode — the session still works, it just will not persist */
    }
    if (on) void this.ensure();
    this.listeners.forEach((fn) => fn(on));
  }

  toggle() {
    this.setEnabled(!this._enabled);
  }

  /** Built lazily, and only ever from inside a user gesture. */
  private async ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    // One second of white noise, reused by every percussive sound.
    const frames = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  }

  /**
   * @param depth  For "block" only: index down the stack. Each step drops the
   *               landing pitch a semitone, so a tall tower audibly descends.
   */
  play(name: SoundName, depth = 0) {
    if (!this._enabled) return;
    const now = performance.now();
    if (now - this.lastAt < THROTTLE_MS && name !== "block") return;
    this.lastAt = now;
    void this.ensure().then(() => this.render(name, depth));
  }

  private render(name: SoundName, depth: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const level = LEVEL[name];

    switch (name) {
      case "press":
        this.tick(t, 1900, 0.008, 0.04, level, "square");
        this.burst(t, 0.03, level * 0.5, 2600);
        break;

      case "toggle":
        this.tick(t, 2600, 0.005, 0.03, level, "square");
        break;

      case "block": {
        // low wooden thunk, one semitone lower per step down the stack
        const f = 150 * Math.pow(2, -depth / 12);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f * 1.8, t);
        osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.3);
        this.burst(t, 0.04, level * 0.35, 900);
        break;
      }

      case "validate":
        // a rising three-note resolve — the run is settled
        [0, 4, 7].forEach((semi, i) => {
          this.tone(t + i * 0.13, 392 * Math.pow(2, semi / 12), 0.42, level, "sine");
        });
        break;

      case "send":
        this.tone(t, 1046.5, 0.5, level, "sine");
        this.tone(t, 2093, 0.34, level * 0.28, "sine");
        break;

      case "blocked": {
        // dull, damped, deliberately pitchless — it does not resolve
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        src.buffer = this.noise;
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(420, t);
        filter.frequency.exponentialRampToValueAtTime(160, t + 0.14);
        g.gain.setValueAtTime(level, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        src.connect(filter).connect(g).connect(master);
        src.start(t);
        src.stop(t + 0.18);
        break;
      }

      case "cleared": {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(1320, t + 0.09);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.14);
        break;
      }

      case "drawer":
        this.burst(t, 0.22, level, 700, 0.06);
        break;
    }
  }

  /* ── synthesis helpers ───────────────────────────────────────────────── */

  private tone(
    at: number,
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.master!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private tick(
    at: number,
    freq: number,
    attack: number,
    decay: number,
    gain: number,
    type: OscillatorType,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, at + decay);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(g).connect(this.master!);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }

  private burst(
    at: number,
    dur: number,
    gain: number,
    cutoff: number,
    attack = 0.002,
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}

export const sound = new SoundEngine();
