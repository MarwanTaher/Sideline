// Client-only helpers for the T-1 tap-spam easter egg. No audio files are
// shipped: the default "farts" are synthesised with Web Audio.

export const SILLY_SOUNDS_KEY = "sideline.sillySounds";
/** 3 taps within 1.5 s starts "spam mode"; it lasts until 1 s passes without a tap. */
export const TAP_SPAM = { taps: 3, windowMs: 1500, calmMs: 1000 } as const;

export function sillySoundsEnabled(): boolean {
  try {
    return localStorage.getItem(SILLY_SOUNDS_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Pure spam detector: returns true for every tap that should fire the sound.
 * The `taps`-th tap inside `windowMs` starts spam mode; from then on every tap
 * fires, with no cooldown, until a gap of `calmMs` ends it.
 */
export function createTapCounter(cfg: { taps: number; windowMs: number; calmMs: number } = TAP_SPAM) {
  let taps: number[] = [];
  let spamming = false;
  let last = -Infinity;
  return (now: number): boolean => {
    if (now - last >= cfg.calmMs) spamming = false;
    last = now;
    if (spamming) return true;
    taps = taps.filter((t) => now - t < cfg.windowMs);
    taps.push(now);
    if (taps.length < cfg.taps) return false;
    taps = [];
    spamming = true;
    return true;
  };
}

type FartShape = {
  dur: number;
  /** Base pitch of the buzz (Hz) and how far it slides by the end. */
  f0: number;
  slide: number;
  /** Wobble (flutter) rate and depth. */
  wob: number;
  depth: number;
  /** Low-pass cutoff for the breathy noise. */
  cutoff: number;
};

const FARTS: FartShape[] = [
  { dur: 0.7, f0: 95, slide: 0.55, wob: 22, depth: 30, cutoff: 600 }, // classic
  { dur: 1.3, f0: 70, slide: 0.8, wob: 13, depth: 20, cutoff: 420 }, // long and low
  { dur: 0.35, f0: 150, slide: 0.6, wob: 38, depth: 55, cutoff: 900 }, // quick squeaker
];

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Note = { f: number; at: number; dur: number };

function playNotes(notes: Note[], type: OscillatorType, cutoff: number, vibratoLast = false): void {
  const ac = audioContext();
  if (!ac) return;
  const t0 = ac.currentTime + 0.02;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.connect(ac.destination);
  notes.forEach((n, i) => {
    const t = t0 + n.at;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(n.f, t);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
    g.gain.setValueAtTime(0.28, t + n.dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    if (vibratoLast && i === notes.length - 1) {
      const lfo = ac.createOscillator();
      lfo.frequency.value = 6;
      const depth = ac.createGain();
      depth.gain.value = n.f * 0.03;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + n.dur);
    }
    osc.connect(g).connect(filter);
    osc.start(t);
    osc.stop(t + n.dur + 0.05);
  });
}

// ---- Crowd sounds (all synthesised) ----

const rand = (a: number, b: number) => a + Math.random() * (b - a);

let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = ac.sampleRate * 2;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** Master bus with a compressor so stacked voices never clip. */
function bus(ac: AudioContext, level: number): GainNode {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 6;
  comp.connect(ac.destination);
  const g = ac.createGain();
  g.gain.value = level;
  g.connect(comp);
  return g;
}

/** Overall swell-in / fade-out envelope multiplier at time x (0..dur). */
const swell = (x: number, dur: number) => Math.min(1, x / 0.35) * Math.min(1, (dur - x) / (dur * 0.45));

function applause(ac: AudioContext, out: AudioNode, t0: number, dur: number, people = 14): void {
  const buf = noise(ac);
  for (let p = 0; p < people; p++) {
    const rate = rand(3.2, 5.5); // claps per second
    const centre = rand(900, 2400); // each person's hands sound different
    const level = rand(0.25, 0.6);
    for (let x = rand(0, 0.25); x < dur; x += (1 / rate) * rand(0.85, 1.15)) {
      const amp = level * swell(x, dur);
      if (amp < 0.02) continue;
      const t = t0 + x;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = centre * rand(0.9, 1.1);
      bp.Q.value = 1.2;
      const g = ac.createGain();
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + rand(0.03, 0.07));
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random() * 1.5);
      src.stop(t + 0.08);
    }
  }
}

/** A vowel-shaped voice: sawtooth through two formant band-passes. */
function voice(ac: AudioContext, out: AudioNode, f1: number, f2: number): { osc: OscillatorNode; amp: GainNode } {
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  const amp = ac.createGain();
  amp.gain.value = 0;
  for (const [f, q, lvl] of [
    [f1, 6, 1],
    [f2, 8, 0.6],
  ] as const) {
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = ac.createGain();
    g.gain.value = lvl;
    osc.connect(bp).connect(g).connect(amp);
  }
  amp.connect(out);
  return { osc, amp };
}

function cheer(ac: AudioContext, out: AudioNode, t0: number, dur: number, people = 10): void {
  // Crowd roar: breathy "aah" noise.
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.8;
  const roar = ac.createGain();
  roar.gain.setValueAtTime(0.0001, t0);
  roar.gain.exponentialRampToValueAtTime(0.35, t0 + 0.4);
  roar.gain.setValueAtTime(0.35, t0 + dur * 0.55);
  roar.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(roar).connect(out);
  src.start(t0);
  src.stop(t0 + dur);

  // Individual "woo!" / "yeah!" voices: rising pitch with vibrato.
  for (let p = 0; p < people; p++) {
    const start = t0 + rand(0, dur * 0.5);
    const len = rand(0.5, 1.1);
    const f = rand(220, 520);
    const ooh = Math.random() < 0.5;
    const { osc, amp } = voice(ac, out, ooh ? 400 : 750, ooh ? 900 : 1250);
    osc.frequency.setValueAtTime(f * 0.8, start);
    osc.frequency.exponentialRampToValueAtTime(f * 1.35, start + len * 0.6);
    osc.frequency.exponentialRampToValueAtTime(f * 1.1, start + len);
    const lfo = ac.createOscillator();
    lfo.frequency.value = rand(5, 7);
    const depth = ac.createGain();
    depth.gain.value = f * 0.04;
    lfo.connect(depth).connect(osc.frequency);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(rand(0.25, 0.45), start + 0.08);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + len);
    for (const n of [osc, lfo]) {
      n.start(start);
      n.stop(start + len + 0.05);
    }
  }
}

function sitcomLaugh(ac: AudioContext, out: AudioNode, t0: number, dur: number, people = 12): void {
  for (let p = 0; p < people; p++) {
    const pitch = rand(140, 380); // deep chuckles to high giggles
    const rate = rand(4.5, 7); // "ha"s per second
    const start = rand(0, 0.4);
    const stop = dur * rand(0.6, 1);
    const { osc, amp } = voice(ac, out, rand(650, 850), rand(1100, 1400));
    osc.frequency.setValueAtTime(pitch * 1.15, t0 + start);
    osc.frequency.linearRampToValueAtTime(pitch * 0.85, t0 + stop);
    // Breath between "ha"s.
    const br = ac.createBufferSource();
    br.buffer = noise(ac);
    br.loop = true;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1500;
    const brg = ac.createGain();
    brg.gain.value = 0;
    br.connect(hp).connect(brg).connect(out);

    const level = rand(0.2, 0.4);
    for (let x = start; x < stop; x += (1 / rate) * rand(0.9, 1.1)) {
      const t = t0 + x;
      const a = level * swell(x, dur);
      if (a < 0.02) continue;
      const on = 0.55 / rate;
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(a, t + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + on);
      brg.gain.setValueAtTime(0.0001, t);
      brg.gain.exponentialRampToValueAtTime(a * 0.35, t + 0.01);
      brg.gain.exponentialRampToValueAtTime(0.0001, t + on * 0.6);
    }
    for (const n of [osc, br]) {
      n.start(t0 + start);
      n.stop(t0 + stop + 0.1);
    }
  }
}

export type MomentTone = "epic" | "good" | "info" | "bummer";
/** Sound options per tone; one is picked at random each time. */
export const MOMENT_SOUNDS = {
  epic: ["fanfare", "cheer"],
  good: ["chime", "applause"],
  info: ["ding"],
  bummer: ["trombone", "laugh"],
} as const satisfies Record<MomentTone, readonly string[]>;

/** Short synthesised sound for a moment pop-up (random pick per tone, or a named one). */
export function playMomentSound(tone: MomentTone, pick?: string): void {
  const options: readonly string[] = MOMENT_SOUNDS[tone];
  const name = pick && options.includes(pick) ? pick : options[Math.floor(Math.random() * options.length)];
  const ac = audioContext();
  if (!ac) return;
  const t0 = ac.currentTime + 0.03;
  switch (name) {
    case "cheer": {
      const out = bus(ac, 0.9);
      cheer(ac, out, t0, 2.8);
      applause(ac, out, t0 + 0.1, 3.2, 16);
      return;
    }
    case "applause":
      applause(ac, bus(ac, 1), t0, 2.6);
      return;
    case "laugh":
      sitcomLaugh(ac, bus(ac, 0.9), t0, 2.6);
      return;
    case "fanfare":
      // C5 E5 G5 … C6 held.
      playNotes(
        [
          { f: 523.25, at: 0, dur: 0.14 },
          { f: 659.25, at: 0.12, dur: 0.14 },
          { f: 783.99, at: 0.24, dur: 0.14 },
          { f: 1046.5, at: 0.4, dur: 0.6 },
        ],
        "triangle",
        4000,
      );
      return;
    case "chime":
      playNotes(
        [
          { f: 659.25, at: 0, dur: 0.16 },
          { f: 987.77, at: 0.14, dur: 0.4 },
        ],
        "triangle",
        4000,
      );
      return;
    case "trombone":
      // Wah wah wah waaah.
      playNotes(
        [
          { f: 293.66, at: 0, dur: 0.38 },
          { f: 277.18, at: 0.4, dur: 0.38 },
          { f: 261.63, at: 0.8, dur: 0.38 },
          { f: 246.94, at: 1.2, dur: 1.0 },
        ],
        "sawtooth",
        900,
        true,
      );
      return;
    default:
      playNotes([{ f: 880, at: 0, dur: 0.35 }], "sine", 3000);
  }
}

/** Synthesise one of the built-in farts (random when no index is given). */
export function playFart(index = Math.floor(Math.random() * FARTS.length)): void {
  const ac = audioContext();
  if (!ac) return;
  const s = FARTS[index % FARTS.length];
  const t = ac.currentTime;

  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.6, t + 0.03);
  out.gain.setValueAtTime(0.6, t + s.dur * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
  out.connect(ac.destination);

  // Buzzy body: a sawtooth whose pitch flutters and sags.
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(s.f0, t);
  osc.frequency.exponentialRampToValueAtTime(s.f0 * s.slide, t + s.dur);
  const lfo = ac.createOscillator();
  lfo.frequency.value = s.wob;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = s.depth;
  lfo.connect(lfoGain).connect(osc.frequency);
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = s.cutoff * 1.4;
  const toneGain = ac.createGain();
  toneGain.gain.value = 0.55;
  osc.connect(tone).connect(toneGain).connect(out);

  // Breath: filtered noise, amplitude-modulated by the same flutter.
  const len = Math.ceil(ac.sampleRate * s.dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const nf = ac.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.value = s.cutoff;
  const ng = ac.createGain();
  ng.gain.value = 0.35;
  const flutter = ac.createGain();
  flutter.gain.value = 0.25;
  lfo.connect(flutter).connect(ng.gain);
  noise.connect(nf).connect(ng).connect(out);

  for (const node of [osc, lfo, noise]) {
    node.start(t);
    node.stop(t + s.dur + 0.05);
  }
}
