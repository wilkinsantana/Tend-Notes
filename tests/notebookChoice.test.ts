import { describe, expect, test } from 'bun:test';
import { chooseNotebook, emptyListMessage, notebookStorageKey, rememberNotebook, savedNotebook, NOTEBOOK_PROBE_LIMIT } from '../src/notebookChoice';

const lib = (id: string, name = id) => ({ id, name, canCreate: true });
// Mirrors production on 2026-10-08: the newest notebook is empty, the notes live in older ones.
const libraries = [lib('church', 'Church'), lib('learning-go', 'Learning Go'), lib('my-notes', 'My notes'), lib('docs', 'Docs')];
const counts: Record<string, number> = { church: 0, 'learning-go': 9, 'my-notes': 2, docs: 0 };

function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
}

describe('chooseNotebook', () => {
  test('reopens the notebook the person last chose, even when a newer one sorts first', async () => {
    const probed: string[] = [];
    const chosen = await chooseNotebook(libraries, 'my-notes', async id => { probed.push(id); return counts[id]; });
    expect(chosen).toBe('my-notes');
    expect(probed).toEqual([]);
  });

  test('without a saved choice, skips an empty newest notebook and opens the first with notes', async () => {
    expect(await chooseNotebook(libraries, '', async id => counts[id])).toBe('learning-go');
  });

  test('a saved notebook that no longer exists falls back to the first notebook with notes', async () => {
    expect(await chooseNotebook(libraries, 'deleted-notebook', async id => counts[id])).toBe('learning-go');
  });

  test('when every notebook is empty, opens the first one', async () => {
    expect(await chooseNotebook(libraries, '', async () => 0)).toBe('church');
  });

  test('a single notebook is opened without probing', async () => {
    let probes = 0;
    expect(await chooseNotebook([lib('only')], '', async () => { probes++; return 0; })).toBe('only');
    expect(probes).toBe(0);
  });

  test('no notebooks yields no selection', async () => {
    expect(await chooseNotebook([], 'anything', async () => 1)).toBe('');
  });

  test('probing is bounded', async () => {
    const many = Array.from({ length: NOTEBOOK_PROBE_LIMIT + 5 }, (_, i) => lib(`n${i}`));
    let probes = 0;
    expect(await chooseNotebook(many, '', async () => { probes++; return 0; })).toBe('n0');
    expect(probes).toBe(NOTEBOOK_PROBE_LIMIT);
  });

  test('a failed probe is reported, never treated as an empty notebook', async () => {
    await expect(chooseNotebook(libraries, '', async () => { throw new Error('Bad Gateway'); })).rejects.toThrow('Bad Gateway');
  });
});

describe('remembered notebook', () => {
  test('round-trips per person under an unversioned key', () => {
    const storage = memory();
    rememberNotebook(storage, 'user-a', 'learning-go');
    expect(savedNotebook(storage, 'user-a')).toBe('learning-go');
    expect(savedNotebook(storage, 'user-b')).toBe('');
    expect([...storage.values.keys()]).toEqual([notebookStorageKey('user-a')]);
    expect(notebookStorageKey('user-a')).not.toMatch(/\d+\.\d+/);
  });

  test('unavailable browser storage never breaks opening Notes', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(() => rememberNotebook(broken, 'user-a', 'x')).not.toThrow();
    expect(savedNotebook(broken, 'user-a')).toBe('');
    expect(savedNotebook(undefined, 'user-a')).toBe('');
  });
});

describe('emptyListMessage', () => {
  const base = { loaded: true, failed: false, query: '', notebookName: 'Church', notebookCount: 4 };
  test('never says the notebook is empty before the list has loaded', () => {
    expect(emptyListMessage({ ...base, loaded: false })).toBe('Opening your notes…');
    expect(emptyListMessage({ ...base, loaded: false, failed: true })).toBe('Reconnecting to your notes…');
  });
  test('points to the other notebooks when this one is empty', () => {
    expect(emptyListMessage(base)).toBe('“Church” has no notes yet. Your other notebooks are in the menu above.');
  });
  test('keeps the existing wording for a single notebook and for searches', () => {
    expect(emptyListMessage({ ...base, notebookCount: 1 })).toBe('Your next idea starts here.');
    expect(emptyListMessage({ ...base, query: 'go' })).toBe('No matching notes.');
  });
});
