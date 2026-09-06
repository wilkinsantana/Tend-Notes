import { test, expect } from 'bun:test';
import { TaskWorkspace, type TaskState } from '../src/taskWorkspace';
import type { Document, Documents, Library } from '../src/host';

function fixture() {
  const library: Library = { id: 'a', name: 'Home', canCreate: true };
  const revision = (content: string) => new Bun.CryptoHasher('sha256').update(content).digest('hex');
  const doc = (id: string, content: string, libraryId = 'a'): Document => ({ id, libraryId, content, name: id+'.md', revision: revision(content), size: content.length, modifiedAt: 0 });
  const documents = new Map([['one', doc('one', '# Shopping\n- [ ] Milk\n- [ ] Milk\n')], ['two', doc('two', '- [x] Sent\n', 'b')]]);
  const libraries = [library, { id: 'b', name: 'Work', canCreate: true }];
  let saves = 0;
  const api = {
    async libraries() { return libraries; },
    async list(id: string, _query: string, offset: number) {
      const items = [...documents.values()].filter(d => d.libraryId === id);
      return { items: items.slice(offset, offset+1), total: items.length, nextOffset: offset+1 < items.length ? offset+1 : null };
    },
    async read(id: string) { const d = documents.get(id); if (!d) throw new Error('Not found'); return {...d}; },
    async save(id: string, input: {content:string; revision:string}) {
      saves++; const old = documents.get(id)!;
      if (old.revision !== input.revision) throw Object.assign(new Error('Conflict'), {status:409});
      const saved = doc(id, input.content, old.libraryId); documents.set(id, saved); return saved;
    },
  } as unknown as Documents;
  let state: TaskState;
  const workspace = new TaskWorkspace(api, next => state = next);
  return {workspace, api, documents, libraries, doc, get state(){return state!;}, get saves(){return saves;}};
}

test('all notebook pages are collected and duplicate labels have distinct source identities', async () => {
  const f = fixture(); f.documents.set('three', f.doc('three', '- [ ] Bread\n'));
  await f.workspace.refresh();
  expect(f.state.scanned).toBe(3); expect(f.state.errors).toEqual([]);
  expect(f.state.rows).toHaveLength(4); expect(new Set(f.state.rows.map(r=>r.key)).size).toBe(4);
  const milk = f.state.rows.filter(r=>r.text==='Milk');
  await f.workspace.toggle(milk[1].key, true);
  expect(f.documents.get('one')!.content).toBe('# Shopping\n- [ ] Milk\n- [x] Milk\n');
  expect(f.saves).toBe(1);
});

test('a reordered remote note is never edited through the old task identity', async () => {
  const f=fixture(); await f.workspace.refresh(); const key=f.state.rows[0].key;
  f.documents.set('one',f.doc('one','- [ ] Different\n- [ ] Milk\n'));
  expect(await f.workspace.toggle(key,true)).toBeNull();
  expect(await f.workspace.open(key)).toBeNull();
  expect(f.saves).toBe(0); expect(f.state.errors.join(' ')).toContain('Refresh tasks');
  expect(f.documents.get('one')!.content).toBe('- [ ] Different\n- [ ] Milk\n');
});

test('write race preserves remote bytes and unchanged checkbox state', async () => {
  const f=fixture(); await f.workspace.refresh(); const before=f.state.rows;
  f.api.save=async () => {f.documents.set('one',f.doc('one','Concurrent writing'));throw Object.assign(new Error('Revision conflict'),{status:409});};
  expect(await f.workspace.toggle(before[0].key,true)).toBeNull();
  expect(f.state.rows).toEqual(before); expect(f.state.errors).toContain('Revision conflict');
  expect(f.documents.get('one')!.content).toBe('Concurrent writing');
});

test('lost response retry accepts only the exact intended whole document without another write', async () => {
  const f=fixture(); await f.workspace.refresh(); const key=f.state.rows[0].key;
  const save=f.api.save;
  f.api.save=async (...args) => {await save(...args);throw new Error('Connection interrupted');};
  expect(await f.workspace.toggle(key,true)).toBeNull(); expect(f.state.rows[0].checked).toBe(false);
  expect(await f.workspace.toggle(key,true)).not.toBeNull(); expect(f.saves).toBe(1);
  expect(f.state.rows.filter(r=>r.checked)).toHaveLength(2);
});

test('no optimistic completion or second operation during a delayed save', async () => {
  const f=fixture(); await f.workspace.refresh(); const key=f.state.rows[0].key;
  let release!:()=>void; const wait=new Promise<void>(r=>release=r); const save=f.api.save;
  f.api.save=async (...args) => {await wait;return save(...args);};
  const pending=f.workspace.toggle(key,true);
  await Promise.resolve();
  expect(f.state.busy).toBe(true); expect(f.state.rows[0].checked).toBe(false);
  expect(await f.workspace.toggle(key,true)).toBeNull();
  expect(await f.workspace.open(key)).toBeNull();
  release(); await pending; expect(f.saves).toBe(1); expect(f.state.busy).toBe(false);
});

test('read-only notebooks and disappeared documents fail safely', async () => {
  const f=fixture(); f.libraries[0].canCreate=false; await f.workspace.refresh();
  expect(f.state.rows[0].canWrite).toBe(false);
  expect(await f.workspace.toggle(f.state.rows[0].key,true)).toBeNull(); expect(f.saves).toBe(0);
  f.documents.delete('two');
  expect(await f.workspace.open(f.state.rows.find(r=>r.noteId==='two')!.key)).toBeNull();
  expect(f.state.errors[0]).toBe('Not found');
});

test('partial read failure remains explicit alongside successfully loaded tasks', async () => {
  const f=fixture(); const read=f.api.read;
  f.api.read=async id=> {if(id==='one')throw new Error('Storage disconnected');return read(id);};
  await f.workspace.refresh(); expect(f.state.loading).toBe(false); expect(f.state.rows).toHaveLength(1);
  expect(f.state.errors).toEqual(['one.md: Storage disconnected']); expect(f.state.scanned).toBe(2);
});

test('cancelled scan cannot publish late read results or replace a later refresh', async () => {
  const f=fixture(); const read=f.api.read;
  let release!:()=>void; const wait=new Promise<void>(r=>release=r);
  f.api.read=async id => {await wait;return read(id);};
  const pending=f.workspace.refresh(); await Promise.resolve(); await Promise.resolve();
  f.workspace.cancel(); f.api.read=read; await f.workspace.refresh(); const latest=f.state;
  release(); await pending; expect(f.state).toEqual(latest); expect(f.state.rows).toHaveLength(3);
});

test('resource bounds and malformed pagination are visible partial results', async () => {
  const f=fixture(); let state!:TaskState;
  const limited=new TaskWorkspace(f.api,next=>state=next,{notes:1,bytes:1024});
  await limited.refresh(); expect(state.rows).toHaveLength(2); expect(state.errors.join(' ')).toContain('note limit');
  const memory=new TaskWorkspace(f.api,next=>state=next,{notes:100,bytes:1});
  await memory.refresh(); expect(state.rows).toEqual([]); expect(state.errors.join(' ')).toContain('memory limit');
  f.api.list=async () => ({items:[],total:1,nextOffset:0});
  await f.workspace.refresh(); expect(f.state.errors.join(' ')).toContain('list changed unexpectedly');
});


test('cancelled scan rejection cannot pollute a newer successful scan', async () => {
  const f=fixture(); const read=f.api.read;
  let reject!:(e:Error)=>void; const wait=new Promise<never>((_,r)=>reject=r);
  f.api.read=async () => wait;
  const pending=f.workspace.refresh(); await Promise.resolve(); await Promise.resolve();
  f.workspace.cancel(); f.api.read=read; await f.workspace.refresh(); const latest=f.state;
  reject(new Error('Old disconnected source')); await pending;
  expect(f.state).toEqual(latest); expect(f.state.errors).toEqual([]); expect(f.state.rows).toHaveLength(3);
});

test('cancelled parser results cannot replace a newer scan', async () => {
  const f=fixture();
  const {extractTasks,setTaskChecked}=await import('../src/tasks');
  let release!:(tasks:ReturnType<typeof extractTasks>)=>void;
  let started!:()=>void;const entered=new Promise<void>(r=>started=r);
  const pendingParse=new Promise<ReturnType<typeof extractTasks>>(r=>release=r);
  let first=true,disposed=0;let state!:TaskState;
  const processor={async extract(content:string){if(first){first=false;started();return pendingParse;}return extractTasks(content);},async setChecked(...args:Parameters<typeof setTaskChecked>){return setTaskChecked(...args);},dispose(){disposed++;}};
  const workspace=new TaskWorkspace(f.api,next=>state=next,undefined,processor);
  const pending=workspace.refresh();await entered;workspace.cancel();await workspace.refresh();
  const latest=state;release(extractTasks('- [ ] Old scan'));await pending;
  expect(state).toEqual(latest);expect(state.rows).toHaveLength(3);expect(disposed).toBe(1);
});

test('worker parse errors remain visible and never publish partial task edits',async()=>{
  const f=fixture();const {extractTasks,setTaskChecked}=await import('../src/tasks');let fail=false;let state!:TaskState;
  const processor={async extract(content:string){return extractTasks(content);},async setChecked(...args:Parameters<typeof setTaskChecked>){if(fail)throw new Error('Task worker unavailable');return setTaskChecked(...args);},dispose(){}};
  const workspace=new TaskWorkspace(f.api,next=>state=next,undefined,processor);await workspace.refresh();fail=true;
  const before=state.rows;expect(await workspace.toggle(before[0].key,true)).toBeNull();
  expect(f.saves).toBe(0);expect(state.rows).toEqual(before);expect(state.errors).toContain('Task worker unavailable');
});

test('parse failure after a confirmed save can retry without repeating the write',async()=>{
  const f=fixture();const {extractTasks,setTaskChecked}=await import('../src/tasks');let failNext=false;let state!:TaskState;
  const processor={async extract(content:string){if(failNext){failNext=false;throw new Error('Worker interrupted after save');}return extractTasks(content);},async setChecked(...args:Parameters<typeof setTaskChecked>){return setTaskChecked(...args);},dispose(){}};
  const workspace=new TaskWorkspace(f.api,next=>state=next,undefined,processor);await workspace.refresh();const key=state.rows[0].key;failNext=true;
  expect(await workspace.toggle(key,true)).toBeNull();expect(f.saves).toBe(1);expect(state.rows[0].checked).toBe(false);
  expect(await workspace.toggle(key,true)).not.toBeNull();expect(f.saves).toBe(1);expect(state.rows.filter(r=>r.checked)).toHaveLength(2);
});
