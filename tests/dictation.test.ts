import { describe, expect, test } from 'bun:test';
import { DictationController, prepareDictationInsertion, type DictationState, type DictationTarget } from '../src/dictation';
import type { Speech, SpeechCapture } from '../src/host';

const target: DictationTarget = {
  noteId: 'note-1', noteName: 'Idea.md', content: 'before after', body: 'before after',
  selection: {start: 7, end: 7}, canWrite: true, conflict: false,
};

function speechFixture() {
  let callbacks!: Parameters<Speech['start']>[0];
  let resolveStart!: (capture: SpeechCapture) => void;
  let cancelled = 0;
  let stopped = 0;
  let signal: AbortSignal | undefined;
  const capture: SpeechCapture = {stop: async () => { stopped += 1; }, cancel: () => { cancelled += 1; }};
  const speech: Speech = {
    version: 1,
    status: async () => ({installed: true, bytes: 1}),
    install: async () => {}, remove: async () => {}, dispose: () => {},
    start: input => { callbacks = input; signal = input.signal; return new Promise(resolve => { resolveStart = resolve; }); },
  };
  return {speech, capture, callbacks: () => callbacks, signal: () => signal, resolveStart: () => resolveStart(capture), cancelled: () => cancelled, stopped: () => stopped};
}

describe('dictation capture ownership', () => {
  test('appends final segments, replaces partial text, and finalizes on stop', async () => {
    const fixture = speechFixture();
    let state!: DictationState;
    const controller = new DictationController(fixture.speech, value => state = value);
    controller.prepare(target);
    const starting = controller.start();
    fixture.callbacks().onPartial('hel');
    fixture.callbacks().onPartial('hello');
    fixture.callbacks().onFinal('Hello.');
    fixture.callbacks().onFinal('Second sentence.');
    fixture.resolveStart();
    expect(await starting).toBe(true);
    await controller.stop();
    expect(fixture.stopped()).toBe(1);
    expect(state.phase).toBe('draft');
    expect(state.transcript).toBe('Hello. Second sentence.');
  });

  test('cancels a late start after navigation and ignores its late final', async () => {
    const fixture = speechFixture();
    let state!: DictationState;
    const controller = new DictationController(fixture.speech, value => state = value);
    controller.prepare(target);
    const starting = controller.start();
    fixture.callbacks().onFinal('Keep this part.');
    controller.noteChanged('note-2');
    expect(fixture.signal()?.aborted).toBe(true);
    fixture.resolveStart();
    expect(await starting).toBe(false);
    fixture.callbacks().onFinal('Must not arrive.');
    expect(fixture.cancelled()).toBe(1);
    expect(state.transcript).toBe('Keep this part.');
    expect(state.error).toContain('switched notes');
  });
});

describe('dictation insertion guard', () => {
  const state = {target, transcript: 'literal *words* <tag> | #1 (maybe) ~'};
  const current = {
    noteId: target.noteId, content: target.content, body: target.body, canWrite: true,
    conflict: false, blocked: false, withBody: (body: string) => body,
  };

  test('prepares one plain-text edit at the pinned selection', () => {
    const result = prepareDictationInsertion(state, current);
    expect(result.body).toBe('before literal \\*words\\* \\<tag\\> \\| \\#1 \\(maybe\\) \\~ after');
    expect(result.before).toEqual({start: 7, end: 7});
    expect(result.after.start).toBe(result.after.end);
  });

  test('refuses another note or changed body without consuming the transcript', () => {
    expect(() => prepareDictationInsertion(state, {...current, noteId: 'note-2'})).toThrow('Open “Idea.md”');
    expect(() => prepareDictationInsertion(state, {...current, content: 'new', body: 'new'})).toThrow('changed after dictation');
    expect(state.transcript).toBe('literal *words* <tag> | #1 (maybe) ~');
  });

  test('refuses read-only, conflict, and byte-limit insertion', () => {
    expect(() => prepareDictationInsertion(state, {...current, canWrite: false})).toThrow('read-only');
    expect(() => prepareDictationInsertion(state, {...current, conflict: true})).toThrow('conflict');
    expect(() => prepareDictationInsertion(state, {...current, withBody: () => 'x'.repeat(1024 * 1024 + 1)})).toThrow('over 1 MB');
  });
});
