import type { Document, Documents } from './host';
export interface Draft { document: Document; content: string; updatedAt: number }
export interface View { document: Document; content: string; dirty: boolean; saving: boolean; error: string; conflict: boolean; recoveryError: string }
export const MAX_BYTES = 1024 * 1024;
export class Drafts {
  readonly prefix: string;
  constructor(private storage: Storage, owner: string, private client: string) { this.prefix = `tend-notes:v1:${encodeURIComponent(owner)}:`; }
  key(id: string) { return `${this.prefix}${encodeURIComponent(id)}:${this.client}`; }
  put(document: Document, content: string) { this.storage.setItem(this.key(document.id), JSON.stringify({ document: { ...document, content: '' }, content, updatedAt: Date.now() })); }
  remove(id: string) { this.storage.removeItem(this.key(id)); }
  list(): Array<Draft & { key: string }> {
    const result: Array<Draft & { key: string }> = [];
    for (let n = 0; n < this.storage.length; n++) {
      const key = this.storage.key(n);
      if (!key?.startsWith(this.prefix)) continue;
      try { const d = JSON.parse(this.storage.getItem(key) ?? 'null');
        if (typeof d?.content === 'string' && typeof d?.document?.id === 'string' && typeof d.document.name === 'string' && typeof d.document.libraryId === 'string' && typeof d.document.revision === 'string' && /^[a-f0-9]{64}$/.test(d.document.revision) && typeof d.updatedAt === 'number' && key.startsWith(`${this.prefix}${encodeURIComponent(d.document.id)}:`)) result.push({ ...d, key });
      } catch { /* Ignore malformed recovery records without deleting them. */ }
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  forget(key: string) { if (key.startsWith(this.prefix)) this.storage.removeItem(key); }
}
export class NoteSession {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight: Promise<boolean> | undefined;
  private disposed = false;
  view: View;
  constructor(document: Document, private api: Documents, private drafts: Drafts, private changed: (view: View) => void) {
    this.view = { document, content: document.content, dirty: false, saving: false, error: '', conflict: false, recoveryError: '' };
  }
  private emit() { this.changed({ ...this.view }); }
  private recoverable() {
    try { this.drafts.put(this.view.document, this.view.content); this.view.recoveryError = ''; }
    catch { this.view.recoveryError = 'Browser recovery is unavailable. Keep this note open until it is saved, or export a copy.'; }
  }
  edit(content: string) {
    this.view.content = content;
    this.view.dirty = content !== this.view.document.content;
    this.recoverable();
    clearTimeout(this.timer);
    if (!this.view.conflict && !this.disposed) this.timer = setTimeout(() => void this.save(), 700);
    this.emit();
  }
  restore(draft: Draft) {
    this.view.content = draft.content;
    this.view.dirty = draft.content !== this.view.document.content;
    this.view.conflict = draft.document.revision !== this.view.document.revision && this.view.dirty;
    if (this.view.conflict) this.view.error = 'The saved note changed since this draft. Export your draft or save it as a new note.';
    this.recoverable(); this.emit();
  }
  save(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.inflight) return this.inflight.then(ok => ok && this.view.dirty ? this.save() : ok);
    if (!this.view.dirty) return Promise.resolve(true);
    if (this.view.conflict) return Promise.resolve(false);
    if (new TextEncoder().encode(this.view.content).length > MAX_BYTES) {
      this.view.error = 'This note exceeds 1 MB. Export it and split it into smaller notes.'; this.emit(); return Promise.resolve(false);
    }
    const content = this.view.content;
    const document = this.view.document;
    this.view.saving = true; this.view.error = ''; this.emit();
    this.inflight = (async () => {
      try {
        const saved = await Promise.resolve().then(() => this.api.save(document.id, { content, revision: document.revision }));
        this.view.document = saved;
        this.view.dirty = this.view.content !== saved.content;
        if (this.view.dirty) this.recoverable();
        else { try { this.drafts.remove(document.id); } catch { /* A stale draft can be recognized on recovery. */ } }
        return true;
      } catch (error) {
        this.view.error = error instanceof Error ? error.message : 'The save could not be confirmed. Your draft is still here.';
        this.view.conflict = (error as { status?: number })?.status === 409;
        this.recoverable(); return false;
      } finally { this.inflight = undefined; this.view.saving = false; this.emit(); }
    })();
    return this.inflight;
  }
  acceptRemote(document: Document) {
    if (this.view.dirty || this.view.saving || document.id !== this.view.document.id) return false;
    this.view.document = document; this.view.content = document.content; this.view.error = ''; this.emit(); return true;
  }
  retainAfterDeletion() {
    this.disposed = true; clearTimeout(this.timer);
    this.view.conflict = true;
    this.view.error = 'This note was moved to Trash. Your newer draft is still here: export it or save it as a new note.';
    if (this.view.dirty) this.recoverable();
    this.emit();
  }
  abandon() { this.disposed = true; clearTimeout(this.timer); }
  async dispose() { this.disposed = true; clearTimeout(this.timer); return this.save(); }
}
