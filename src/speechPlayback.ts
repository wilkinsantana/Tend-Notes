export interface SpeechPcmChunk { pcm: ArrayBuffer; sampleRate: number; segmentIndex?: number }
export type PlaybackState = 'ready' | 'playing' | 'paused' | 'stopped';

/** Two scheduled chunks overlap synthesis with playback; drain owns the tail. */
export function createSpeechPlayback(
  onState: (state: PlaybackState) => void = () => {},
  onSegment: (segmentIndex: number | null) => void = () => {},
) {
  const context = new AudioContext();
  const ready = context.resume();
  let closed = false, pending = false, paused = false, nextStart = 0;
  const sources = new Set<AudioBufferSourceNode>();
  const scheduled = new Map<AudioBufferSourceNode, {at: number; segmentIndex: number | null}>();
  let current: AudioBufferSourceNode | null = null;
  const waiters = new Set<() => void>();
  const wake = () => { for (const notify of [...waiters]) notify(); waiters.clear(); };
  const changed = () => new Promise<void>(resolve => waiters.add(resolve));
  const state = (value: PlaybackState) => {
    if (!closed || value === 'stopped') { try { onState(value); } catch { /* Observers cannot block queue cleanup. */ } }
  };
  const segment = (value: number | null) => {
    if (!closed || value === null) { try { onSegment(value); } catch { /* Observers cannot block queue cleanup. */ } }
  };
  const setCurrent = (node: AudioBufferSourceNode | null) => {
    if (current === node) return;
    current = node;
    segment(node ? scheduled.get(node)?.segmentIndex ?? null : null);
  };
  context.onstatechange = () => {
    if (closed) return;
    if (context.state === 'running') { state(paused ? 'paused' : sources.size ? 'playing' : 'ready'); wake(); }
    else if (context.state !== 'closed') state('paused');
  };

  async function play(chunk: SpeechPcmChunk): Promise<void> {
    if (closed) throw Error('Read-aloud has stopped.');
    if (pending) throw Error('Wait for the current speech segment to be queued.');
    if (!(chunk.pcm instanceof ArrayBuffer) || chunk.sampleRate !== 24000 ||
        !chunk.pcm.byteLength || chunk.pcm.byteLength % 4 || chunk.pcm.byteLength > 24000 * 120 * 4) {
      throw Error('The speech audio is invalid or too large.');
    }
    pending = true;
    try {
      await ready;
      while (!closed && (paused || context.state !== 'running' || sources.size >= 2)) await changed();
      if (closed) throw Error('Read-aloud has stopped.');
      const samples = new Float32Array(chunk.pcm);
      if (samples.some(value => !Number.isFinite(value))) throw Error('The speech audio contains invalid samples.');
      const buffer = context.createBuffer(1, samples.length, chunk.sampleRate);
      buffer.copyToChannel(samples, 0);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      const start = Math.max(context.currentTime, nextStart);
      node.onended = () => {
        const wasCurrent = current === node;
        node.disconnect(); sources.delete(node); scheduled.delete(node);
        if (wasCurrent) {
          const next = [...sources].sort((a, b) => (scheduled.get(a)?.at ?? 0) - (scheduled.get(b)?.at ?? 0))[0] ?? null;
          setCurrent(next);
        }
        if (!sources.size) nextStart = context.currentTime;
        state(context.state === 'running' ? (sources.size ? 'playing' : 'ready') : 'paused');
        wake();
      };
      sources.add(node);
      scheduled.set(node, {at:start, segmentIndex:Number.isInteger(chunk.segmentIndex) ? chunk.segmentIndex! : null});
      try {
        node.start(start);
        nextStart = start + samples.length / chunk.sampleRate;
        if (!current && start <= context.currentTime + 0.001) setCurrent(node);
        state(context.state === 'running' ? 'playing' : 'paused');
      } catch (error) { node.onended = null; node.disconnect(); sources.delete(node); scheduled.delete(node); throw error; }
    } finally { pending = false; wake(); }
  }

  return {
    ready, play,
    async drain() { while (!closed && (pending || sources.size)) await changed(); },
    async pause() { if (!closed) { paused = true; await context.suspend(); segment(null); state('paused'); } },
    async resume() { if (!closed) { await context.resume(); paused = false; wake(); if (current) segment(scheduled.get(current)?.segmentIndex ?? null); state(sources.size ? 'playing' : 'ready'); } },
    stop() {
      if (closed) return;
      closed = true;
      context.onstatechange = null;
      for (const source of sources) {
        source.onended = null;
        try { source.stop(); } catch { /* It may already have ended. */ }
        source.disconnect();
      }
      sources.clear(); scheduled.clear(); setCurrent(null); wake();
      void context.close().catch(() => {});
      state('stopped');
    },
  };
}
