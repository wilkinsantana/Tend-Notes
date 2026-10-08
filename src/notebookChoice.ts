// notebookChoice decides which notebook Notes opens on. The panel orders
// notebooks by when they last changed, so "the first one" moves whenever a
// notebook is created, renamed, or scanned. Opening on it after every reload
// (each Tend or Notes update reloads the page) made an empty notebook look
// like every note was gone. The rule now: reopen the notebook the person last
// chose; without one, open the first notebook that actually holds notes.

import type { Library } from './host';

/** Unversioned on purpose: the choice must survive Notes and Tend updates. */
export const notebookStorageKey = (userId: string) => `tend-notes:notebook:${userId}`;

/** Bounded so a person with many notebooks never waits on a long probe. */
export const NOTEBOOK_PROBE_LIMIT = 8;

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

export function savedNotebook(storage: KeyValue | undefined, userId: string | undefined): string {
  if (!storage || !userId) return '';
  try { return storage.getItem(notebookStorageKey(userId)) ?? ''; } catch { return ''; }
}

export function rememberNotebook(storage: KeyValue | undefined, userId: string | undefined, libraryId: string): void {
  if (!storage || !userId || !libraryId) return;
  try { storage.setItem(notebookStorageKey(userId), libraryId); } catch { /* The choice still applies for this visit. */ }
}

/**
 * Picks the notebook to open. `countNotes` errors propagate: if the panel is
 * unreachable the caller must show "reconnecting", never an empty notebook.
 */
export async function chooseNotebook(libraries: Library[], saved: string, countNotes: (libraryId: string) => Promise<number>): Promise<string> {
  if (!libraries.length) return '';
  if (saved && libraries.some(library => library.id === saved)) return saved;
  if (libraries.length === 1) return libraries[0].id;
  for (const library of libraries.slice(0, NOTEBOOK_PROBE_LIMIT)) {
    if ((await countNotes(library.id)) > 0) return library.id;
  }
  return libraries[0].id;
}

/** The sidebar's message when the open notebook shows no notes. */
export function emptyListMessage(state: { loaded: boolean; failed: boolean; query: string; notebookName?: string; notebookCount: number }): string {
  if (!state.loaded) return state.failed ? 'Reconnecting to your notes…' : 'Opening your notes…';
  if (state.query) return 'No matching notes.';
  if (state.notebookCount > 1 && state.notebookName) return `“${state.notebookName}” has no notes yet. Your other notebooks are in the menu above.`;
  return 'Your next idea starts here.';
}
