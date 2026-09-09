import { marked } from 'marked';
import type { Documents, Note } from './host';

export const noteLink = (id: string): string => `tend-note:${encodeURIComponent(id)}`;
export function linkedNoteId(href: string): string | null {
  if (!href.startsWith('tend-note:')) return null;
  try {
    const id = decodeURIComponent(href.slice(10));
    return id && id.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(id) && noteLink(id) === href ? id : null;
  } catch { return null; }
}
/** Only parsed Markdown links count; source examples and raw HTML never do. */
export function noteReferences(content: string): Set<string> {
  const result = new Set<string>();
  marked.walkTokens(marked.lexer(content), token => {
    if (token.type !== 'link') return;
    const id = linkedNoteId(token.href);
    if (id) result.add(id);
  });
  return result;
}
export interface BacklinkState {
  notes: Note[]; scanned: number; partial: boolean; done: boolean; cancelled: boolean; errors: number;
}
/** Transient projection. The capability enforces access; never persists note bodies. */
export async function scanBacklinks(documents: Documents, target: string, options: {
  signal?: AbortSignal; onprogress?: (state: BacklinkState) => void;
  maxDocuments?: number; maxBytes?: number;
} = {}): Promise<BacklinkState> {
  const state: BacklinkState = {notes: [], scanned: 0, partial: false, done: false, cancelled: false, errors: 0};
  const maxDocuments = Math.min(500, Math.max(1, options.maxDocuments ?? 500));
  const maxBytes = Math.min(8 * 1024 * 1024, Math.max(1, options.maxBytes ?? 8 * 1024 * 1024));
  let bytes = 0;
  let pages = 0;
  const seen = new Set<string>();
  const publish = () => options.onprogress?.({...state, notes: [...state.notes]});
  const cancelled = () => {
    if (!options.signal?.aborted) return false;
    state.cancelled = true; state.partial = true; return true;
  };
  try {
    if (cancelled()) return state;
    const libraries = await documents.libraries();
    outer: for (const library of libraries.slice(0, 100)) {
      const offsets = new Set<number>();
      let offset: number | null = 0;
      while (offset !== null) {
        if (cancelled()) break outer;
        if (offsets.has(offset) || offsets.size >= 500) { state.partial = true; break; }
        if (pages++ >= 500) { state.partial = true; break outer; }
        offsets.add(offset);
        let page;
        try { page = await documents.list(library.id, '', offset); }
        catch { state.errors++; state.partial = true; break; }
        if (cancelled()) break outer;
        for (const note of page.items) {
          if (cancelled()) break outer;
          if (seen.has(note.id)) continue;
          if (seen.size >= maxDocuments) { state.partial = true; break outer; }
          seen.add(note.id);
          if (note.id === target) continue;
          if (note.size > 1024 * 1024 || note.size > maxBytes - bytes) { state.partial = true; continue; }
          try {
            const document = await documents.read(note.id);
            if (cancelled()) break outer;
            const size = new TextEncoder().encode(document.content).length;
            if (size > 1024 * 1024 || size > maxBytes - bytes) { state.partial = true; continue; }
            bytes += size; state.scanned++;
            if (noteReferences(document.content).has(target)) state.notes.push(note);
          } catch { state.errors++; state.partial = true; }
          publish();
        }
        offset = page.nextOffset;
      }
    }
    if (libraries.length > 100) state.partial = true;
  } catch { state.errors++; state.partial = true; }
  finally { state.done = true; publish(); }
  return state;
}
