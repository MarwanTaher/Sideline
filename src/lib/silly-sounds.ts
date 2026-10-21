// Client-only helpers for the T-1 tap-spam easter egg. No audio files are
// shipped: the default "farts" are synthesised with Web Audio.

export const SILLY_SOUNDS_KEY = "sideline.sillySounds";
export const TAP_SPAM = { taps: 4, windowMs: 2000, cooldownMs: 3000 } as const;

export function sillySoundsEnabled(): boolean {
  try {
    return localStorage.getItem(SILLY_SOUNDS_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Pure tap counter: returns true on the tap that should fire the sound.
 * Keeps only taps inside the window; after firing, the cooldown swallows taps.
 */
export function createTapCounter(cfg: { taps: number; windowMs: number; cooldownMs: number } = TAP_SPAM) {
  let taps: number[] = [];
  let quietUntil = 0;
  return (now: number): boolean => {
    if (now < quietUntil) return false;
    taps = taps.filter((t) => now - t < cfg.windowMs);
    taps.push(now);
    if (taps.length < cfg.taps) return false;
    taps = [];
    quietUntil = now + cfg.cooldownMs;
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
