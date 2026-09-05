/** Development-only host. This entry is excluded from the extension package. */
import { activate } from './index';
import type { Document, Host } from './host';
const key = 'tend-notes:demo-documents';
const state = { readDelay: 0, saveDelay: 0, saveFails: false };
Object.assign(window, { notesDemo: state });
const revision = async (content: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const get = (): Document[] => JSON.parse(localStorage.getItem(key) ?? '[]');
const put = (docs: Document[]) => localStorage.setItem(key, JSON.stringify(docs));
if (!localStorage.getItem(key)) {
  const content = '# Small things worth keeping\n\nA little space for thoughts before they become plans.\n\n## This week\n\n- Make something useful\n- Leave room to explore\n- Write it down before it slips away\n\n> There is no right way to begin. Just begin.\n';
  put([{id:'welcome',libraryId:'personal',name:'Small things worth keeping.md',modifiedAt:Math.floor(Date.now()/1000),size:content.length,content,revision:await revision(content)}]);
}
const host: Host = { id:'host.tend.notes',user:{id:'demo-user',name:'You',role:'user'},onUnmount(){},documents:{version:1,
  async libraries(){return new URLSearchParams(location.search).has('empty') ? [] : [{id:'personal',name:'Personal notes',canCreate:!new URLSearchParams(location.search).has('unconnected')},{id:'work',name:'Work notes',canCreate:!new URLSearchParams(location.search).has('unconnected')}];},
  async index(){return {indexed:0,skipped:0,more:false};},
  async list(libraryId,query='',offset=0){const all=get().filter(d=>d.libraryId===libraryId&&(d.name+' '+d.content).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(b.modifiedAt??0)-(a.modifiedAt??0));return {items:all.slice(offset,offset+100),total:all.length,nextOffset:all.length>offset+100?offset+100:null};},
  async read(id){if(state.readDelay) await new Promise(r=>setTimeout(r,state.readDelay));const d=get().find(d=>d.id===id);if(!d) throw Object.assign(new Error('Note not found'),{status:404});return d;},
  async create(input){const all=get();const exists=all.find(d=>d.libraryId===input.libraryId&&d.name===input.name);if(exists){if(exists.content===input.content)return exists;throw Object.assign(new Error('A note with this name already exists.'),{status:409});}const d={...input,id:crypto.randomUUID(),revision:await revision(input.content),size:input.content.length,modifiedAt:Math.floor(Date.now()/1000)};put([...all,d]);return d;},
  async save(id,input){if(state.saveDelay)await new Promise(r=>setTimeout(r,state.saveDelay));if(state.saveFails) throw new Error('Demo connection interrupted');const all=get(),at=all.findIndex(d=>d.id===id);if(at<0)throw new Error('Note not found');if(all[at].revision!==input.revision&&all[at].content!==input.content)throw Object.assign(new Error('This note changed elsewhere. Keep your draft or reload the saved version.'),{status:409});all[at]={...all[at],content:input.content,revision:await revision(input.content),modifiedAt:Math.floor(Date.now()/1000),size:input.content.length};put(all);return all[at];},
  async delete(id,rev){const all=get(),d=all.find(d=>d.id===id);if(d?.revision!==rev)throw Object.assign(new Error('This note changed elsewhere.'),{status:409});put(all.filter(d=>d.id!==id));},
}};
activate(host).mount(document.querySelector('#app')!);
