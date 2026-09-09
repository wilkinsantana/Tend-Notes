import type { Speech, SpeechCapture } from './host';
import { MAX_BYTES } from './session';

export interface DictationTarget {
  noteId: string;
  noteName: string;
  content: string;
  body: string;
  selection: {start: number; end: number};
  canWrite: boolean;
  conflict: boolean;
}

export type DictationPhase = 'idle' | 'ready' | 'starting' | 'recording' | 'stopping' | 'draft';

export interface DictationState {
  phase: DictationPhase;
  target: DictationTarget | null;
  finalSegments: string[];
  partial: string;
  transcript: string;
  error: string;
}

const MAX_TRANSCRIPT_UNITS = 128 * 1024;

function cleanSegment(text: string) {
  return text.replace(/\0/g, '').replace(/\r\n?/g, '\n').trim();
}

function joinSegments(segments: string[], partial = '') {
  return [...segments, cleanSegment(partial)].filter(Boolean).join(' ').trim();
}

function cloneTarget(target: DictationTarget | null): DictationTarget | null {
  return target ? {...target, selection: {...target.selection}} : null;
}

export class DictationController {
  private capture: SpeechCapture | null = null;
  private startController: AbortController | null = null;
  private generation = 0;
  private disposed = false;
  private value: DictationState = {phase: 'idle', target: null, finalSegments: [], partial: '', transcript: '', error: ''};

  constructor(private readonly speech: Speech, private readonly changed: (state: DictationState) => void) {}

  get state() { return this.snapshot(); }
  get active() { return ['starting', 'recording', 'stopping'].includes(this.value.phase); }

  prepare(target: DictationTarget) {
    if (this.active || this.value.transcript) return false;
    this.value = {...this.value, phase: 'ready', target: cloneTarget(target), error: ''};
    this.emit();
    return true;
  }

  async start() {
    if (this.disposed || this.active || !this.value.target) return false;
    if (this.value.transcript) {
      this.report('Insert, copy, or discard the current transcript before starting another dictation.');
      return false;
    }
    const ticket = ++this.generation;
    const request = new AbortController();
    this.startController = request;
    this.value = {...this.value, phase: 'starting', finalSegments: [], partial: '', transcript: '', error: ''};
    this.emit();
    try {
      const capture = await this.speech.start({
        onPartial: text => this.receivePartial(ticket, text),
        onFinal: text => this.receiveFinal(ticket, text),
        onError: message => this.fail(ticket, message),
        signal: request.signal,
      });
      if (this.disposed || ticket !== this.generation) {
        capture.cancel();
        return false;
      }
      if (this.startController === request) this.startController = null;
      this.capture = capture;
      this.value = {...this.value, phase: 'recording'};
      this.emit();
      return true;
    } catch (cause) {
      if (ticket === this.generation && !this.disposed) {
        this.value = {...this.value, phase: 'draft', error: cause instanceof Error ? cause.message : 'Dictation could not start. Check microphone access and try again.'};
        this.emit();
      }
      if (this.startController === request) this.startController = null;
      return false;
    }
  }

  async stop() {
    if (this.disposed || !this.active) return;
    const ticket = this.generation;
    const capture = this.capture;
    this.value = {...this.value, phase: 'stopping'};
    this.emit();
    try {
      if (capture) await capture.stop();
      // start() can still be awaiting the host's microphone permission prompt.
      if (!capture) return this.cancel('Dictation stopped before microphone access completed.');
      if (ticket !== this.generation || this.disposed) return;
      this.capture = null;
      this.generation += 1;
      this.value = {...this.value, phase: 'draft'};
      this.emit();
    } catch (cause) {
      if (ticket !== this.generation || this.disposed) return;
      this.capture = null;
      this.generation += 1;
      this.value = {...this.value, phase: 'draft', error: cause instanceof Error ? cause.message : 'Dictation was interrupted. Your transcript is still here.'};
      this.emit();
    }
  }

  cancel(reason = '') {
    if (this.disposed) return;
    this.generation += 1;
    this.startController?.abort();
    this.startController = null;
    this.capture?.cancel();
    this.capture = null;
    const phase = this.value.target ? 'draft' : 'idle';
    this.value = {...this.value, phase, error: reason || this.value.error};
    this.emit();
  }

  noteChanged(noteId: string | null) {
    if (this.active && this.value.target?.noteId !== noteId) {
      this.cancel('Dictation stopped when you switched notes. The transcript is still available here.');
    }
  }

  report(message: string) {
    this.value = {...this.value, error: message};
    this.emit();
  }

  clear() {
    if (this.active) return false;
    this.value = {phase: 'idle', target: null, finalSegments: [], partial: '', transcript: '', error: ''};
    this.emit();
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.generation += 1;
    this.startController?.abort();
    this.startController = null;
    this.capture?.cancel();
    this.capture = null;
    this.disposed = true;
    this.speech.dispose();
  }

  private receivePartial(ticket: number, text: string) {
    if (!this.accepts(ticket)) return;
    const partial = cleanSegment(text).slice(0, MAX_TRANSCRIPT_UNITS);
    if (joinSegments(this.value.finalSegments, partial).length > MAX_TRANSCRIPT_UNITS) {
      this.cancel('This dictation reached its safe transcript limit. Insert or copy what was captured, then start another.');
      return;
    }
    this.value = {...this.value, partial, transcript: joinSegments(this.value.finalSegments, partial)};
    this.emit();
  }

  private receiveFinal(ticket: number, text: string) {
    if (!this.accepts(ticket)) return;
    const segment = cleanSegment(text);
    if (!segment) { this.value = {...this.value, partial: '', transcript: joinSegments(this.value.finalSegments)}; this.emit(); return; }
    const finalSegments = [...this.value.finalSegments, segment];
    if (joinSegments(finalSegments).length > MAX_TRANSCRIPT_UNITS) {
      this.cancel('This dictation reached its safe transcript limit. Insert or copy what was captured, then start another.');
      return;
    }
    this.value = {...this.value, finalSegments, partial: '', transcript: joinSegments(finalSegments)};
    this.emit();
  }

  private fail(ticket: number, message: string) {
    if (!this.accepts(ticket)) return;
    this.cancel(message || 'Dictation was interrupted. Your transcript is still here.');
  }

  private accepts(ticket: number) {
    return !this.disposed && ticket === this.generation && this.active;
  }

  private snapshot(): DictationState {
    return {...this.value, target: cloneTarget(this.value.target), finalSegments: [...this.value.finalSegments]};
  }

  private emit() { this.changed(this.snapshot()); }
}

function plainMarkdown(text: string) {
  return cleanSegment(text)
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]()<>#+\-!|>~])/g, '\\$1')
    // Only a line-leading numbered-list marker gives a period Markdown meaning.
    .replace(/^( {0,3}\d{1,9})\.(?=[ \t])/gm, '$1\\.');
}

export function prepareDictationInsertion(
  state: Pick<DictationState, 'target' | 'transcript'>,
  current: {noteId: string; content: string; body: string; canWrite: boolean; conflict: boolean; blocked: boolean; withBody(body: string): string},
) {
  const target = state.target;
  const transcript = plainMarkdown(state.transcript);
  if (!target || !transcript) throw new Error('There is no transcript to insert yet.');
  if (target.noteId !== current.noteId) throw new Error(`Open “${target.noteName}” to insert this transcript. It is still available here.`);
  if (!target.canWrite || !current.canWrite) throw new Error('This note is read-only. Copy the transcript before leaving this dialog.');
  if (target.conflict || current.conflict) throw new Error('Resolve the note conflict before inserting. The transcript is still available here.');
  if (current.blocked) throw new Error('Finish the current note action before inserting. The transcript is still available here.');
  if (target.content !== current.content || target.body !== current.body) throw new Error('This note changed after dictation started. Copy the transcript or start again at the current cursor.');
  const start = Math.max(0, Math.min(target.body.length, Math.trunc(target.selection.start)));
  const end = Math.max(start, Math.min(target.body.length, Math.trunc(target.selection.end)));
  const leading = start > 0 && !/\s/.test(target.body[start - 1]) ? ' ' : '';
  const trailing = end < target.body.length && !/\s/.test(target.body[end]) ? ' ' : '';
  const inserted = leading + transcript + trailing;
  const body = target.body.slice(0, start) + inserted + target.body.slice(end);
  if (new TextEncoder().encode(current.withBody(body)).length > MAX_BYTES) {
    throw new Error('This transcript would take the note over 1 MB. Copy it and insert it into a smaller note.');
  }
  return {body, before: {...target.selection}, after: {start: start + inserted.length, end: start + inserted.length}};
}
