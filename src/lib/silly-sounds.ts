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

/** Short synthesised sting for a moment pop-up: fanfare, chime, ding or sad trombone. */
export function playMomentSound(tone: "epic" | "good" | "info" | "bummer"): void {
  if (tone === "epic") {
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
  } else if (tone === "good") {
    playNotes(
      [
        { f: 659.25, at: 0, dur: 0.16 },
        { f: 987.77, at: 0.14, dur: 0.4 },
      ],
      "triangle",
      4000,
    );
  } else if (tone === "info") {
    playNotes([{ f: 880, at: 0, dur: 0.35 }], "sine", 3000);
  } else {
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
