import { describe, test, expect } from 'bun:test';
import { Drafts, NoteSession } from '../src/session';
import type { Document, Documents } from '../src/host';
class MemoryStorage implements Storage {
  data = new Map<string,string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.get(k) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string,v: string) { this.data.set(k,v); }
}
const document: Document = { id:'note-1', libraryId:'library-1', name:'Idea.md', modifiedAt:1, size:3, content:'old', revision:'a'.repeat(64) };
function setup(save: Documents['save'], storage = new MemoryStorage()) {
  const drafts = new Drafts(storage, 'owner', 'tab');
  const api = { save } as Documents;
  return { session: new NoteSession({ ...document }, api, drafts, () => {}), drafts, storage };
}

describe('confirmed saves and recovery', () => {
  test('edits during a save stay dirty and use the new revision on the next save', async () => {
    let finish!: (d: Document) => void;
    let calls = 0;
    const {session, drafts} = setup(async (_, body) => {
      calls++;
      if (calls === 1) return new Promise<Document>(r => finish = r);
      expect(body.revision).toBe('b'.repeat(64));
      return {...document, content:body.content, revision:'c'.repeat(64)};
    });
    session.edit('first'); const saving = session.save(); session.edit('second');
    await Promise.resolve();
    finish({...document, content:'first', revision:'b'.repeat(64)});
    await saving;
    expect(session.view.dirty).toBe(true);
    expect(drafts.list()[0].content).toBe('second');
    await session.dispose();
    expect(calls).toBe(2); expect(session.view.dirty).toBe(false); expect(drafts.list()).toHaveLength(0);
  });
  test('failed or conflicting writes never clear the draft', async () => {
    let calls = 0;
    const {session, drafts} = setup(async () => { calls++; throw Object.assign(new Error('Changed elsewhere'), {status:409}); });
    session.edit('mine'); expect(await session.save()).toBe(false);
    expect(session.view.conflict).toBe(true); expect(session.view.dirty).toBe(true);
    expect(drafts.list()[0].content).toBe('mine');
    session.edit('still mine'); await session.dispose(); expect(calls).toBe(1);
  });
  test('recovery warns when the canonical revision differs', async () => {
    const {session, drafts} = setup(async () => { throw new Error('must not write'); });
    session.restore({document:{...document,revision:'b'.repeat(64)},content:'recovered',updatedAt:1});
    expect(session.view.conflict).toBe(true); expect(await session.dispose()).toBe(false);
    expect(drafts.list()[0].content).toBe('recovered');
  });
  test('accounts and tabs keep separate recovery copies', () => {
    const storage = new MemoryStorage();
    const a = new Drafts(storage, 'alice', 'one'); const b = new Drafts(storage, 'bob', 'one');
    const a2 = new Drafts(storage, 'alice', 'two');
    a.put(document,'A'); b.put(document,'B'); a2.put(document,'A2');
    expect(a.list().map(d=>d.content).sort()).toEqual(['A','A2']); expect(b.list().map(d=>d.content)).toEqual(['B']);
    a.remove(document.id); expect(a2.list().map(d=>d.content)).toEqual(['A2']);
  });
  test('storage quota failure remains visible and server save still works', async () => {
    const storage = new MemoryStorage(); storage.setItem = () => {throw new Error('quota');};
    const {session} = setup(async (_,body) => ({...document,content:body.content}), storage);
    session.edit('new'); expect(session.view.recoveryError).toContain('unavailable');
    expect(await session.dispose()).toBe(true); expect(session.view.dirty).toBe(false);
  });
});

test('confirmed deletion retains a newer draft and never saves it back to a removed note', async () => {
  let writes = 0;
  const {session, drafts} = setup(async () => { writes++; return document; });
  session.edit('Newer writing after the deletion request');
  session.retainAfterDeletion();
  expect(session.view.dirty).toBe(true);
  expect(session.view.conflict).toBe(true);
  expect(drafts.list()[0].content).toBe('Newer writing after the deletion request');
  expect(await session.dispose()).toBe(false);
  expect(writes).toBe(0);
});
