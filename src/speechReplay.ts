import type { SpeechTts } from './host';
type Options = Parameters<SpeechTts['synthesize']>[0];
type Chunk = Parameters<Options['onChunk']>[0];
type Summary = Awaited<ReturnType<SpeechTts['synthesize']>>;
type Entry = {chunks: Chunk[]; bytes: number};

export function speechReplayParagraphs(tts: SpeechTts, text: string): string[] {
  const lines = tts.supportsSegments ? text.split(/\n+/).map(paragraph => paragraph.trim()).filter(Boolean) : [text];
  return lines.length <= 1000 ? lines : [text];
}

/** Completed paragraphs only, RAM only, with one aggregate audio budget. */
export class SpeechReplay {
  private generation = 0;
  private cached = new Map<string, Entry>();
  private bytes = 0;
  constructor(private readonly maxBytes = 24 * 1024 * 1024) {}
  clear() { this.generation++; this.cached.clear(); this.bytes = 0; }
  async speak(tts: SpeechTts, options: Options, preserveOtherParagraphs = false): Promise<Summary> {
    const voice = options.voice ?? tts.getDefaultVoice();
    // Old hosts still benefit from whole-reading replay; new hosts batch all
    // missing paragraphs into ONE worker/model load, not one per paragraph.
    const paragraphs = speechReplayParagraphs(tts, options.text);
    const cacheKey = tts.getCacheKey?.() ?? '';
    const keys = paragraphs.map(text => JSON.stringify([text, voice, options.speed ?? 1, cacheKey]));
    const wanted = new Set(keys);
    for (const [key, entry] of this.cached) if (!preserveOtherParagraphs && !wanted.has(key)) { this.bytes -= entry.bytes; this.cached.delete(key); }
    const ticket = ++this.generation;
    const active = () => {
      if (options.signal?.aborted || ticket !== this.generation) throw new DOMException('Read-aloud stopped.', 'AbortError');
    };
    active();
    const missing = paragraphs.map((_, index) => index).filter(index => !this.cached.has(keys[index]));
    let cursor = 0, outputIndex = 0, sampleCount = 0;
    const play = async (chunk: Chunk, paragraphIndex: number) => {
      active();
      await options.onChunk({...chunk, index: outputIndex++, segmentIndex:paragraphIndex, pcm: chunk.pcm.slice(0)});
      active(); sampleCount += chunk.sampleCount;
    };
    const playCachedUntil = async (end: number) => {
      while (cursor < end) {
        active();
        const entry = this.cached.get(keys[cursor]);
        if (!entry) throw new Error('Read-aloud changed. Start reading again.');
        for (const chunk of entry.chunks) await play(chunk, cursor);
        cursor++;
      }
    };
    if (!missing.length) { await playCachedUntil(paragraphs.length); return {sampleRate:24000,chunks:outputIndex,sampleCount}; }
    await playCachedUntil(missing[0]);
    let segment = -1, pending: Chunk[] = [], pendingBytes = 0, retain = true;
    const publish = () => {
      active();
      if (segment >= 0 && retain && pending.length) {
        const key = keys[missing[segment]];
        if (!this.cached.has(key)) { this.cached.set(key,{chunks:pending,bytes:pendingBytes}); this.bytes += pendingBytes; }
      }
      pending = []; pendingBytes = 0; retain = true;
    };
    const segments = missing.map(index => paragraphs[index]);
    await tts.synthesize({...options, text:segments.join('\n\n'), voice,
      ...(tts.supportsSegments ? {segments} : {}),
      onChunk: async chunk => {
        active();
        const next = chunk.segmentIndex ?? 0;
        if (!Number.isInteger(next) || next < segment || next >= missing.length) throw new Error('Invalid speech paragraph order.');
        if (next !== segment) {
          publish();
          if (segment >= 0) cursor = missing[segment] + 1;
          // A missing paragraph with no audio contributes nothing to playback.
          while (cursor < missing[next]) {
            if (missing.includes(cursor)) cursor++;
            else await playCachedUntil(cursor + 1);
          }
          segment = next;
        }
        const fits = retain && this.bytes + pendingBytes + chunk.pcm.byteLength <= this.maxBytes;
        const copy = fits ? {...chunk, pcm:chunk.pcm.slice(0)} : null;
        await play(chunk, missing[next]);
        if (!copy) { retain = false; pending = []; pendingBytes = 0; }
        else { pending.push(copy); pendingBytes += copy.pcm.byteLength; }
      },
    });
    active(); publish();
    if (segment >= 0) cursor = missing[segment] + 1;
    while (cursor < paragraphs.length) {
      if (missing.includes(cursor)) cursor++;
      else await playCachedUntil(cursor + 1);
    }
    return {sampleRate:24000,chunks:outputIndex,sampleCount};
  }
}
