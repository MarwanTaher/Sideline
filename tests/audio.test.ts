import assert from "node:assert/strict";
import test from "node:test";
import {
  createTapSoundPlayer,
  playMomentSound,
  playMomentSoundDetailed,
  prepareAudioSession,
  resolveMomentSound,
  stopMomentSound,
} from "../src/lib/silly-sounds";

test("uploaded sounds replace the built-in recordings for their group only", () => {
  const custom = { celebration: ["https://blob/c1.mp3", "https://blob/c2.mp3"], bummer: [] };
  assert.equal(resolveMomentSound("epic", undefined, custom, () => 0.99), "https://blob/c2.mp3");
  assert.equal(resolveMomentSound("good", undefined, custom, () => 0), "https://blob/c1.mp3");
  assert.equal(resolveMomentSound("bummer", undefined, custom, () => 0), "/audio/laugh.mp3");
  assert.equal(resolveMomentSound("epic", "https://blob/c1.mp3", custom), "https://blob/c1.mp3");
  assert.equal(resolveMomentSound("epic", "cheer", custom), "/audio/cheer.mp3");
  assert.equal(resolveMomentSound("epic", undefined, undefined, () => 0), "/audio/cheer.mp3");
  assert.equal(resolveMomentSound("bummer", "https://not-uploaded/x.mp3", custom), "/audio/laugh.mp3");
  assert.equal(resolveMomentSound("info", undefined, custom), null);
});

class TapAudio {
  preload = "";
  currentTime = 0;
  paused = true;
  plays = 0;
  released = false;
  fail: string | null = null;
  constructor(public src: string, private readonly made: TapAudio[]) {
    made.push(this);
  }
  play() {
    if (this.fail) return Promise.reject(new DOMException("Cannot play", this.fail));
    this.paused = false;
    this.plays += 1;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
  load() {
    this.released = this.src === "";
  }
}

test("tap spam reuses one voice: each tap restarts instead of overlapping", async () => {
  const made: TapAudio[] = [];
  const player = createTapSoundPlayer((src) => new TapAudio(src, made) as unknown as HTMLAudioElement);
  player.setUrls(["a.mp3", "b.mp3"]);
  assert.equal(made.length, 2);
  assert.ok(made.every((a) => a.preload === "auto"));

  for (let i = 0; i < 5; i++) {
    made[0].currentTime = 0.4;
    assert.equal(await player.play(["a.mp3", "b.mp3"], () => 0), "played");
  }
  assert.equal(made.length, 2, "rapid taps must not create extra audio elements");
  assert.equal(made[0].plays, 5);
  assert.equal(made[0].currentTime, 0, "each tap restarts from the top");

  await player.play(["a.mp3", "b.mp3"], () => 0.9);
  assert.equal(made[0].paused, true, "switching sounds stops the previous one");
  assert.equal(made[1].paused, false);
  player.stop();
  assert.equal(made[1].paused, true);
});

test("a long-lived app keeps one player per current sound and releases the rest", async () => {
  const made: TapAudio[] = [];
  const player = createTapSoundPlayer((src) => new TapAudio(src, made) as unknown as HTMLAudioElement);
  // Simulate many visits to Home / Availability with the same settings.
  for (let i = 0; i < 20; i++) player.setUrls(["a.mp3", "b.mp3"]);
  assert.equal(made.length, 2, "re-mounting must reuse the shared players");

  player.setUrls(["c.mp3"]);
  assert.equal(player.size(), 1);
  assert.ok(made[0].released && made[1].released, "replaced uploads free their media players");
});

test("a deleted or unplayable upload reports failure so the caller can fall back", async () => {
  const made: TapAudio[] = [];
  const player = createTapSoundPlayer((src) => new TapAudio(src, made) as unknown as HTMLAudioElement);
  player.setUrls(["gone.mp3"]);
  made[0].fail = "NotSupportedError";
  assert.equal(await player.play(["gone.mp3"]), "failed");
  made[0].fail = "AbortError";
  assert.equal(await player.play(["gone.mp3"]), "played", "a newer tap aborting this one is not an error");
  assert.equal(await player.play([]), "failed");
});

test("audio is declared ambient so it mixes with music and follows the iPhone silent switch", () => {
  const nav = { audioSession: { type: "auto" } } as unknown as Navigator;
  prepareAudioSession(nav);
  assert.equal((nav as unknown as { audioSession: { type: string } }).audioSession.type, "ambient");
});

test("recorded audio handles autoplay, replacement and dismissal", async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const audioDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const instances: FakeAudio[] = [];
  let playback: () => Promise<void> = () => Promise.resolve();

  class FakeAudio {
    volume = 1;
    preload = "";
    paused = false;
    ended = false;
    currentTime = 0;
    constructor(public src: string) {
      instances.push(this);
    }
    play() { return playback(); }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  }

  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  try {
    assert.equal(await playMomentSound("epic", "cheer"), true);
    assert.equal(instances[0].src, "/audio/cheer.mp3");
    assert.equal(await playMomentSound("bummer", "laugh"), true);
    assert.equal(instances[0].paused, true);
    assert.equal(instances[1].src, "/audio/laugh.mp3");
    stopMomentSound();
    assert.equal(instances[1].paused, true);

    playback = () => Promise.reject(new DOMException("Gesture required", "NotAllowedError"));
    assert.equal(await playMomentSoundDetailed("good", "applause"), "blocked");
    assert.equal(instances[2].paused, true);

    playback = () => Promise.reject(new DOMException("No source", "NotSupportedError"));
    assert.equal(await playMomentSoundDetailed("good", "applause"), "failed");

    let finish: (() => void) | undefined;
    playback = () => new Promise<void>((resolve) => { finish = resolve; });
    const pending = playMomentSound("good", "applause");
    stopMomentSound();
    finish?.();
    assert.equal(await pending, true);
    assert.equal(instances[4].paused, true);

    const count = instances.length;
    assert.equal(await playMomentSound("info"), true);
    assert.equal(instances.length, count, "info must not create an audio request");

    playback = () => Promise.resolve();
    assert.equal(
      await playMomentSound("bummer", undefined, { celebration: [], bummer: ["https://blob/boo.mp3"] }),
      true,
    );
    assert.equal(instances.at(-1)?.src, "https://blob/boo.mp3");
  } finally {
    stopMomentSound();
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (audioDescriptor) Object.defineProperty(globalThis, "Audio", audioDescriptor);
    else Reflect.deleteProperty(globalThis, "Audio");
  }
});
