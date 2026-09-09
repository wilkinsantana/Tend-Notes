import { afterEach, expect, test } from 'bun:test';
import { createSpeechPlayback } from '../src/speechPlayback';

const original = globalThis.AudioContext;
class FakeContext {
  static latest: FakeContext;
  state = 'running'; destination = {}; onstatechange: (() => void) | null = null;
  node = { buffer: null as unknown, onended: null as (() => void) | null, connect() {}, disconnect() {}, start() {}, stop() {} };
  constructor() { FakeContext.latest = this; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createBuffer() { return { copyToChannel() {} }; }
  createBufferSource() { return this.node; }
}
function fixture() {
  globalThis.AudioContext = FakeContext as unknown as typeof AudioContext;
  return createSpeechPlayback();
}
afterEach(() => { globalThis.AudioContext = original; });

test('waits for audio consumption and rejects an unbounded concurrent queue', async () => {
  const playback = fixture();
  let done = false;
  const audio = { pcm: new Float32Array(24).buffer, sampleRate: 24000 };
  const playing = playback.play(audio).then(() => { done = true; });
  await Promise.resolve();
  expect(done).toBe(false);
  await expect(playback.play(audio)).rejects.toThrow('current speech segment');
  FakeContext.latest.node.onended?.();
  await playing;
  expect(done).toBe(true);
  playback.stop();
});

test('pause preserves the current segment and stop releases its waiting producer', async () => {
  const playback = fixture();
  const playing = playback.play({ pcm: new Float32Array(24).buffer, sampleRate: 24000 });
  await Promise.resolve();
  await playback.pause();
  expect(FakeContext.latest.state).toBe('suspended');
  await playback.resume();
  expect(FakeContext.latest.state).toBe('running');
  playback.stop();
  await playing;
  expect(FakeContext.latest.state).toBe('closed');
  await expect(playback.play({ pcm: new Float32Array(24).buffer, sampleRate: 24000 })).rejects.toThrow('stopped');
  playback.stop();
});

test('rejects malformed, nonfinite and oversized PCM before playback', async () => {
  const playback = fixture();
  await expect(playback.play({ pcm: new ArrayBuffer(3), sampleRate: 24000 })).rejects.toThrow('invalid');
  await expect(playback.play({ pcm: new Float32Array([NaN]).buffer, sampleRate: 24000 })).rejects.toThrow('invalid samples');
  await expect(playback.play({ pcm: new ArrayBuffer(24000 * 121 * 4), sampleRate: 24000 })).rejects.toThrow('too large');
  playback.stop();
});
