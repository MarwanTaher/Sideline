import assert from "node:assert/strict";
import test from "node:test";
import { playMomentSound, stopMomentSound } from "../src/lib/silly-sounds";

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
  } finally {
    stopMomentSound();
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (audioDescriptor) Object.defineProperty(globalThis, "Audio", audioDescriptor);
    else Reflect.deleteProperty(globalThis, "Audio");
  }
});
