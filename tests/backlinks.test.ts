import { test, expect } from 'bun:test';
import { noteLink, linkedNoteId, noteReferences, scanBacklinks } from '../src/backlinks';
import type { Documents, Note } from '../src/host';
const note = (id: string): Note => ({id, libraryId:'lib', name:id, size:20, modifiedAt:null});
function fixture(contents: Record<string,string>): Documents {
  return {libraries: async()=>[{id:'lib', name:'Library',canCreate:true}], list:async()=>({items:Object.keys(contents).map(note),total:Object.keys(contents).length,nextOffset:null}), read:async(id:string)=>({...note(id),content:contents[id],revision:'r'})} as unknown as Documents;
}
test('canonical opaque links round trip; invalid/external links rejected',()=>{
  expect(linkedNoteId(noteLink('a/b ?#'))).toBe('a/b ?#');
  for (const href of ['https://a','tend-note:','tend-note:%ZZ','tend-note:%00','tend-note:a/b']) expect(linkedNoteId(href)).toBeNull();
});
test('only Markdown link tokens, including reference-style links, count',()=>{
  const content='[a](tend-note:one)\n[x][ref]\n\n[ref]: tend-note:two\n\n`[x](tend-note:code)`\n```\n[x](tend-note:fenced)\n```\n![image](tend-note:image)\nplain tend-note:plain\n<a href="tend-note:html">x</a>';
  expect([...noteReferences(content)]).toEqual(['one','two']);
});
test('scan deduplicates notes and skips current note',async()=>{
  const state=await scanBacklinks(fixture({one:'[x](tend-note:target)',two:'plain',target:'[self](tend-note:target)'}),'target');
  expect(state.notes.map(n=>n.id)).toEqual(['one']); expect(state.scanned).toBe(2); expect(state.partial).toBe(false);
});
test('limits report partial results',async()=>{
  const state=await scanBacklinks(fixture({one:'[x](tend-note:target)',two:'[x](tend-note:target)'}),'target',{maxDocuments:1});
  expect(state.notes.length).toBe(1);expect(state.partial).toBe(true);
});
test('failed reads remain partial; cancellation stops future work',async()=>{
  const api=fixture({one:'x'}); api.read=async()=>{throw new Error('denied')};
  expect((await scanBacklinks(api,'target')).errors).toBe(1);
  const controller=new AbortController();controller.abort();let read=false;api.libraries=async()=>{read=true;return []};
  expect((await scanBacklinks(api,'target',{signal:controller.signal})).cancelled).toBe(true);expect(read).toBe(false);
});
test('pagination cycles terminate and report partial',async()=>{
  const api=fixture({one:'[x](tend-note:target)'});api.list=async()=>({items:[note('one')],total:2,nextOffset:0});
  const state=await scanBacklinks(api,'target');expect(state.notes.length).toBe(1);expect(state.partial).toBe(true);
});
test('byte bounds skip large bodies and clearly mark partial',async()=>{
  const state=await scanBacklinks(fixture({one:'[x](tend-note:target)'}),'target',{maxBytes:5});
  expect(state.scanned).toBe(0);expect(state.partial).toBe(true);
});
test('abort after an in-flight read prevents publishing its contents or reading another',async()=>{
  const controller=new AbortController();const api=fixture({one:'x',two:'x'});let reads=0;
  api.read=async id=>{reads++;controller.abort();return {...note(id),revision:'r',content:'[x](tend-note:target)'}};
  const state=await scanBacklinks(api,'target',{signal:controller.signal});
  expect(reads).toBe(1);expect(state.notes).toEqual([]);expect(state.cancelled).toBe(true);
});
