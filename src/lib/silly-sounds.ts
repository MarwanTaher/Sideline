// Client-safe audio helpers. Moment recordings are bundled locally under CC0;
// only the separate tap-spam easter egg still uses synthesized audio.
export const SILLY_SOUNDS_KEY = "sideline.sillySounds";
export const TAP_SPAM = { taps: 3, windowMs: 1500, calmMs: 1000 } as const;

export function sillySoundsEnabled(): boolean {
  try {
    return localStorage.getItem(SILLY_SOUNDS_KEY) !== "off";
  } catch {
    return true;
  }
}

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

export type MomentTone = "epic" | "good" | "info" | "bummer";
export type MomentSoundGroup = "celebration" | "bummer";
/** Admin-uploaded recordings; an empty group falls back to the bundled ones. */
export type MomentSoundUrls = Record<MomentSoundGroup, string[]>;

export const MOMENT_SOUNDS = {
  epic: ["cheer", "applause"],
  good: ["applause", "cheer"],
  info: ["silent"],
  bummer: ["laugh"],
} as const satisfies Record<MomentTone, readonly string[]>;

export const MOMENT_SOUND_FILES: Record<string, string> = {
  cheer: "/audio/cheer.mp3",
  applause: "/audio/applause.mp3",
  laugh: "/audio/laugh.mp3",
};

/** Custom clips may be longer than the bundled ones; both fade out at the cap. */
const MOMENT_FADE_START_S = 7.5;
const MOMENT_MAX_S = 8;

export function momentSoundGroup(tone: MomentTone): MomentSoundGroup | null {
  if (tone === "epic" || tone === "good") return "celebration";
  if (tone === "bummer") return "bummer";
  return null;
}

/**
 * Which file to play. `pick` is a bundled sound name or one of the uploaded
 * URLs (admin preview); otherwise uploaded sounds win over the bundled ones.
 */
export function resolveMomentSound(
  tone: MomentTone,
  pick?: string,
  custom?: MomentSoundUrls,
  random: () => number = Math.random,
): string | null {
  const group = momentSoundGroup(tone);
  if (!group) return null;
  const uploaded = custom?.[group] ?? [];
  if (pick && uploaded.includes(pick)) return pick;
  const bundled: readonly string[] = MOMENT_SOUNDS[tone];
  if (pick && bundled.includes(pick)) return MOMENT_SOUND_FILES[pick] ?? null;
  if (uploaded.length > 0) return uploaded[Math.floor(random() * uploaded.length)];
  const name = bundled[Math.floor(random() * bundled.length)];
  return MOMENT_SOUND_FILES[name] ?? null;
}

let momentAudio: HTMLAudioElement | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

export function stopMomentSound(): void {
  if (fadeTimer != null) clearInterval(fadeTimer);
  fadeTimer = null;
  momentAudio?.pause();
  momentAudio = null;
}

/** False means the browser needs an explicit tap before it permits playback. */
export async function playMomentSound(
  tone: MomentTone,
  pick?: string,
  custom?: MomentSoundUrls,
): Promise<boolean> {
  stopMomentSound();
  if (typeof window === "undefined") return true;
  const src = resolveMomentSound(tone, pick, custom);
  if (!src) return true;
  const audio = new Audio(src);
  momentAudio = audio;
  audio.volume = 0.6;
  audio.preload = "none";
  try {
    await audio.play();
    if (momentAudio !== audio) {
      audio.pause();
      return true;
    }
    fadeTimer = setInterval(() => {
      if (audio.ended || audio.currentTime >= MOMENT_MAX_S) {
        stopMomentSound();
      } else if (audio.currentTime > MOMENT_FADE_START_S) {
        const left = (MOMENT_MAX_S - audio.currentTime) / (MOMENT_MAX_S - MOMENT_FADE_START_S);
        audio.volume = Math.max(0, 0.6 * left);
      }
    }, 100);
    return true;
  } catch (error) {
    if (momentAudio !== audio) return true;
    stopMomentSound();
    if (error instanceof DOMException && error.name === "NotAllowedError") return false;
    console.error("Could not play the moment recording.", error);
    return false;
  }
}

/**
 * One voice for the tap-spam egg: every tap restarts the sound from the top
 * instead of stacking copies on top of each other.
 */
export function createTapSoundPlayer(create: (src: string) => HTMLAudioElement = (src) => new Audio(src)) {
  const cache = new Map<string, HTMLAudioElement>();
  let current: HTMLAudioElement | null = null;
  return {
    preload(urls: string[]): void {
      for (const url of urls) {
        if (cache.has(url)) continue;
        const audio = create(url);
        audio.preload = "auto";
        cache.set(url, audio);
      }
    },
    play(urls: string[], random: () => number = Math.random): void {
      if (urls.length === 0) return;
      this.preload(urls);
      const audio = cache.get(urls[Math.floor(random() * urls.length)])!;
      if (current && current !== audio) current.pause();
      current = audio;
      audio.currentTime = 0;
      void audio.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Could not play the tap sound.", error);
      });
    },
    stop(): void {
      current?.pause();
      current = null;
    },
  };
}

type FartShape = {
  dur: number;
  f0: number;
  slide: number;
  wob: number;
  depth: number;
  cutoff: number;
};

const FARTS: FartShape[] = [
  { dur: 0.7, f0: 95, slide: 0.55, wob: 22, depth: 30, cutoff: 600 },
  { dur: 1.3, f0: 70, slide: 0.8, wob: 13, depth: 20, cutoff: 420 },
  { dur: 0.35, f0: 150, slide: 0.6, wob: 38, depth: 55, cutoff: 900 },
];
let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as Window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") {
    void ctx.resume().catch((error: unknown) => {
      console.error("Could not resume tap sound audio.", error);
    });
  }
  return ctx;
}

let fartVoice: { out: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;

/** Cut the previous fart so rapid taps never pile up into a drone. */
function stopFart(): void {
  if (!fartVoice) return;
  for (const node of fartVoice.nodes) {
    try {
      node.stop();
    } catch {
      // Already stopped.
    }
  }
  fartVoice.out.disconnect();
  fartVoice = null;
}

export function playFart(index = Math.floor(Math.random() * FARTS.length)): void {
  const ac = audioContext();
  if (!ac) return;
  stopFart();
  const s = FARTS[index % FARTS.length];
  const t = ac.currentTime;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.6, t + 0.03);
  out.gain.setValueAtTime(0.6, t + s.dur * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
  out.connect(ac.destination);

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

  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * s.dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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
  fartVoice = { out, nodes: [osc, lfo, noise] };
}
