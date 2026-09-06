import type { Document, Documents, Library } from './host';
import { extractTasks, setTaskChecked, type MarkdownTask } from './tasks';

export interface TaskRow {
  key: string; noteId: string; noteName: string; libraryName: string;
  text: string; checked: boolean; line: number; canWrite: boolean;
}
export interface TaskState { rows: TaskRow[]; loading: boolean; scanned: number; errors: string[]; busy: boolean }
interface Snapshot { document: Document; library: Library; tasks: MarkdownTask[] }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The connection could not be confirmed.';
const stale = () => new Error('This note changed since ToDo was refreshed. Refresh tasks and try again; nothing was overwritten.');

/** Disposable, in-memory projection. A task is identified by document + exact
 * revision + source offset, never by its label. No task survives a revision by
 * fuzzy matching. Canonical Markdown remains the only task store. */
export class TaskWorkspace {
  state: TaskState = { rows: [], loading: false, scanned: 0, errors: [], busy: false };
  private snapshots = new Map<string, Snapshot>();
  private generation = 0;
  constructor(private api: Documents, private changed: (state: TaskState) => void,
    private limits = { notes: 10000, bytes: 20 * 1024 * 1024 }) {}
  private emit() { this.changed({ ...this.state, rows: [...this.state.rows], errors: [...this.state.errors] }); }
  private key(document: Document, task: MarkdownTask) { return JSON.stringify([document.id, document.revision, task.offset]); }
  private rows(snapshot: Snapshot): TaskRow[] {
    return snapshot.tasks.map(task => ({ key: this.key(snapshot.document, task), noteId: snapshot.document.id,
      noteName: snapshot.document.name, libraryName: snapshot.library.name, text: task.text,
      checked: task.checked, line: task.line, canWrite: snapshot.library.canCreate }));
  }
  cancel() { this.generation++; this.snapshots.clear(); this.state = { rows: [], loading: false, scanned: 0, errors: [], busy: false }; }
  async refresh() {
    if (this.state.busy || this.state.loading) return;
    const generation = ++this.generation;
    const active = () => generation === this.generation;
    this.snapshots.clear();
    this.state = { rows: [], loading: true, scanned: 0, errors: [], busy: false }; this.emit();
    let retainedBytes = 0;
    const seen = new Set<string>();
    try {
      const libraries = await this.api.libraries();
      if (!active()) return;
      for (const library of libraries) {
        let offset: number | null = 0;
        try {
          while (offset !== null && active()) {
            const page = await this.api.list(library.id, '', offset, { sort: 'title' });
            if (!active()) return;
            for (const note of page.items) {
              if (seen.has(note.id)) continue;
              if (seen.size >= this.limits.notes) throw new Error('This view reached its note limit. Some tasks are not shown.');
              seen.add(note.id);
              try {
                const document = await this.api.read(note.id);
                if (!active()) return;
                if (document.id !== note.id || document.libraryId !== library.id) throw new Error('The note moved. Refresh to load its current location.');
                const tasks = extractTasks(document.content);
                if (tasks.length) {
                  const bytes = new TextEncoder().encode(document.content).length;
                  if (retainedBytes + bytes > this.limits.bytes) throw new Error('This view reached its memory limit. Some tasks are not shown.');
                  retainedBytes += bytes;
                  const snapshot = { document, library, tasks };
                  this.snapshots.set(document.id, snapshot);
                  this.state.rows.push(...this.rows(snapshot));
                }
              } catch (error) { if (!active()) return; this.state.errors.push(`${note.name}: ${errorText(error)}`); }
              this.state.scanned++; this.emit();
            }
            if (page.nextOffset !== null && page.nextOffset <= offset) throw new Error('The notebook list changed unexpectedly. Refresh to try again.');
            offset = page.nextOffset;
          }
        } catch (error) { if (!active()) return; this.state.errors.push(`${library.name}: ${errorText(error)}`); }
        if (!active()) return;
      }
    } catch (error) { if (active()) this.state.errors.push(errorText(error)); }
    finally { if (active()) { this.state.loading = false; this.emit(); } }
  }
  private resolve(key: string) {
    const row = this.state.rows.find(row => row.key === key);
    const snapshot = row && this.snapshots.get(row.noteId);
    const task = snapshot?.tasks.find(task => this.key(snapshot.document, task) === key);
    if (!snapshot || !task) throw stale();
    return { snapshot, task };
  }
  async open(key: string): Promise<{ document: Document; task: MarkdownTask } | null> {
    if (this.state.busy || this.state.loading) return null;
    this.state.busy = true; this.emit();
    try {
      const { snapshot, task } = this.resolve(key);
      const document = await this.api.read(snapshot.document.id);
      if (document.id !== snapshot.document.id || document.libraryId !== snapshot.document.libraryId ||
          document.revision !== snapshot.document.revision || document.content !== snapshot.document.content) throw stale();
      return { document, task };
    } catch (error) { this.state.errors = [errorText(error), ...this.state.errors]; return null; }
    finally { this.state.busy = false; this.emit(); }
  }
  async toggle(key: string, checked: boolean): Promise<Document | null> {
    if (this.state.busy || this.state.loading) return null;
    this.state.busy = true; this.emit();
    try {
      const { snapshot, task } = this.resolve(key);
      if (!snapshot.library.canCreate) throw new Error('This notebook is read-only. Open its note to see the task.');
      const content = setTaskChecked(snapshot.document.content, task, checked);
      const latest = await this.api.read(snapshot.document.id);
      if (latest.id !== snapshot.document.id || latest.libraryId !== snapshot.document.libraryId) throw stale();
      // A lost save response may have committed the exact intended bytes. Accept
      // only that whole-document match; any other revision requires a refresh.
      let saved: Document;
      if (latest.content === content) saved = latest;
      else {
        if (latest.revision !== snapshot.document.revision || latest.content !== snapshot.document.content) throw stale();
        saved = await this.api.save(latest.id, { content, revision: latest.revision });
        if (saved.id !== latest.id || saved.libraryId !== latest.libraryId || saved.content !== content) throw new Error('The task save could not be confirmed. Refresh before trying again.');
      }
      const next = { ...snapshot, document: saved, tasks: extractTasks(saved.content) };
      this.snapshots.set(saved.id, next);
      this.state.rows = this.state.rows.filter(row => row.noteId !== saved.id).concat(this.rows(next));
      return saved;
    } catch (error) { this.state.errors = [errorText(error), ...this.state.errors]; return null; }
    finally { this.state.busy = false; this.emit(); }
  }
}
