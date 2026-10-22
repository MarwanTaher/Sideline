import assert from "node:assert/strict";
import test from "node:test";
import {
  createTapSoundPlayer,
  playMomentSound,
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

test("tap spam reuses one voice: each tap restarts instead of overlapping", () => {
  const made: TapAudio[] = [];
  class TapAudio {
    preload = "";
    currentTime = 0;
    paused = true;
    plays = 0;
    constructor(readonly src: string) {
      made.push(this);
    }
    play() {
      this.paused = false;
      this.plays += 1;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }
  const player = createTapSoundPlayer((src) => new TapAudio(src) as unknown as HTMLAudioElement);
  player.preload(["a.mp3", "b.mp3"]);
  assert.equal(made.length, 2);
  assert.ok(made.every((a) => a.preload === "auto"));

  for (let i = 0; i < 5; i++) {
    made[0].currentTime = 0.4;
    player.play(["a.mp3", "b.mp3"], () => 0);
  }
  assert.equal(made.length, 2, "rapid taps must not create extra audio elements");
  assert.equal(made[0].plays, 5);
  assert.equal(made[0].currentTime, 0, "each tap restarts from the top");

  player.play(["a.mp3", "b.mp3"], () => 0.9);
  assert.equal(made[0].paused, true, "switching sounds stops the previous one");
  assert.equal(made[1].paused, false);
  player.stop();
  assert.equal(made[1].paused, true);
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
    constructor(readonly src: string) {
      instances.push(this);
    }
    play() { return playback(); }
    pause() { this.paused = true; }
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
    assert.equal(await playMomentSound("good", "applause"), false);
    assert.equal(instances[2].paused, true);

    let finish: (() => void) | undefined;
    playback = () => new Promise<void>((resolve) => { finish = resolve; });
    const pending = playMomentSound("good", "applause");
    stopMomentSound();
    finish?.();
    assert.equal(await pending, true);
    assert.equal(instances[3].paused, true);

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
