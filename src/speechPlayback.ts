export interface SpeechPcmChunk { pcm: ArrayBuffer; sampleRate: number }
export type PlaybackState = 'ready' | 'playing' | 'paused' | 'stopped';

/** Create during a user gesture. One awaited chunk provides synthesis backpressure. */
export function createSpeechPlayback(onState: (state: PlaybackState) => void = () => {}) {
  const context = new AudioContext();
  const ready = context.resume();
  let closed = false;
  let pending = false;
  let source: AudioBufferSourceNode | null = null;
  let finish: (() => void) | null = null;
  const state = (value: PlaybackState) => { if (!closed || value === 'stopped') onState(value); };
  context.onstatechange = () => {
    if (closed) return;
    if (context.state === 'running') state(source ? 'playing' : 'ready');
    else if (context.state !== 'closed') state('paused');
  };

  async function play(chunk: SpeechPcmChunk): Promise<void> {
    if (closed) throw Error('Read-aloud has stopped.');
    if (pending) throw Error('Wait for the current speech segment to finish.');
    if (!(chunk.pcm instanceof ArrayBuffer) || chunk.sampleRate !== 24000 ||
        !chunk.pcm.byteLength || chunk.pcm.byteLength % 4 || chunk.pcm.byteLength > 24000 * 120 * 4) {
      throw Error('The speech audio is invalid or too large.');
    }
    pending = true;
    try {
      await ready;
      if (closed) throw Error('Read-aloud has stopped.');
      const samples = new Float32Array(chunk.pcm);
      if (samples.some(value => !Number.isFinite(value))) throw Error('The speech audio contains invalid samples.');
      const buffer = context.createBuffer(1, samples.length, chunk.sampleRate);
      buffer.copyToChannel(samples, 0);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      source = node;
      await new Promise<void>((resolve, reject) => {
        finish = resolve;
        node.onended = () => {
          node.disconnect();
          if (source === node) source = null;
          finish = null;
          state(context.state === 'running' ? 'ready' : 'paused');
          resolve();
        };
        try { node.start(); state(context.state === 'running' ? 'playing' : 'paused'); }
        catch (error) { node.disconnect(); source = null; finish = null; reject(error); }
      });
    } finally { pending = false; }
  }

  return {
    ready,
    play,
    async pause() { if (!closed) { await context.suspend(); state('paused'); } },
    async resume() { if (!closed) { await context.resume(); state(source ? 'playing' : 'ready'); } },
    stop() {
      if (closed) return;
      closed = true;
      context.onstatechange = null;
      if (source) {
        source.onended = null;
        try { source.stop(); } catch { /* It may already have ended. */ }
        source.disconnect(); source = null;
      }
      finish?.(); finish = null;
      void context.close().catch(() => {});
      state('stopped');
    },
  };
}
