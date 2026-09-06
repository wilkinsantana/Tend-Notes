/** Development-only host. This entry is excluded from the extension package. */
import { activate } from './index';
import { demoStorageSetup } from './demoSetup';
import { unpack } from './organization';
import type { Document, Host, BackupState } from './host';
const key = 'tend-notes:demo-documents';
const renamedLibraries = new Map<string,string>();
const attachments = new Map<string,Blob>();
const extraLibraries: Array<{id: string; name: string; canCreate: boolean}> = [];
const extraDestinations: Array<{id: string; name: string; provider: string}> = [];
const state = { readDelay: 0, saveDelay: 0, saveFails: false, backupFixture: false };
let demoBackups: BackupState = {schedule:{destination_source_id:'',interval_minutes:0,next_run_at:null},jobs:[]};
Object.assign(window, { notesDemo: state });
const revision = async (content: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const get = (): Document[] => JSON.parse(localStorage.getItem(key) ?? '[]');
const put = (docs: Document[]) => localStorage.setItem(key, JSON.stringify(docs));
if (!localStorage.getItem(key)) {
  const content = '# Small things worth keeping\n\nA little space for thoughts before they become plans.\n\n## This week\n\n- Make something useful\n- Leave room to explore\n- Write it down before it slips away\n\n> There is no right way to begin. Just begin.\n';
  put([{id:'welcome',libraryId:'personal',name:'Small things worth keeping.md',modifiedAt:Math.floor(Date.now()/1000),size:content.length,content,revision:await revision(content)}]);
}
const host: Host = { id:'host.tend.notes',user:{id:'demo-user',name:'You',role:'user'},onUnmount(){},documents:{version:1,
  async renameLibrary(id,name){renamedLibraries.set(id,name);return {id,name,canCreate:true};},
  async rename(id,input){const all=get(),at=all.findIndex(d=>d.id===id);if(at<0)throw new Error('Note not found');if(all[at].revision!==input.revision)throw new Error('Note changed elsewhere');if(all.some(d=>d.id!==id&&d.libraryId===all[at].libraryId&&d.name===input.name))throw new Error('A note with this name already exists.');all[at]={...all[at],name:input.name};put(all);return all[at];},
  attachments:{async upload(_id,file){const bytes=await file.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');const ext=file.type.includes('png')?'png':file.type.includes('jpeg')?'jpg':file.type.includes('wav')?'wav':'webm';const path='attachments/'+hash+'.'+ext;attachments.set(path,file);return{path,type:file.type};},async read(_id,path){const blob=attachments.get(path);if(!blob)throw new Error('Sample attachment unavailable after reload');return blob;}},
  async setupLibrary(){const input=await demoStorageSetup('notebook');if(!input)return null;const library={id:crypto.randomUUID(),name:input.name,canCreate:true};extraLibraries.push(library);return library;},
  backups: {
    async setupDestination(){const input=await demoStorageSetup('backup');if(!input)return null;const destination={id:crypto.randomUUID(),...input};extraDestinations.push(destination);return destination;},
    async state(){return structuredClone(demoBackups);},
    async destinations(){return [...(state.backupFixture ? [{id:'sample-drive',name:'Sample backup folder',provider:'local'}] : []),...extraDestinations];},
    async configure(input){if(!state.backupFixture)throw new Error('Automatic backups connect to your storage when Notes runs inside Tend.');demoBackups.schedule={destination_source_id:input.destinationSourceId,interval_minutes:input.intervalMinutes,next_run_at:input.intervalMinutes?Math.floor(Date.now()/1000)+input.intervalMinutes*60:null};return structuredClone(demoBackups);},
    async start(input){if(!state.backupFixture)throw new Error('ZIP exports use your Tend panel. This development preview contains sample notes only.');const now=Math.floor(Date.now()/1000);const job={id:crypto.randomUUID(),library_id:input.libraryId??null,destination_source_id:input.destinationSourceId??null,status:'completed',total:1,completed:1,error:null,filename:'sample.zip',sha256:'fixture',bytes:22,created_at:now,completed_at:now,cancel_requested:0,downloadAvailable:true};demoBackups.jobs.unshift(job);return job;},
    async cancel(id){const job=demoBackups.jobs.find(j=>j.id===id);if(!job)throw new Error('Export not found');return job;},
    downloadUrl(){return 'data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==';},
  },
  async libraries(){return [...(new URLSearchParams(location.search).has('empty') ? [] : [{id:'personal',name:'Personal notes',canCreate:!new URLSearchParams(location.search).has('unconnected')},{id:'work',name:'Work notes',canCreate:!new URLSearchParams(location.search).has('unconnected')}]),...extraLibraries].map(l=>({...l,name:renamedLibraries.get(l.id)??l.name}));},
  async index(){return {indexed:0,skipped:0,more:false};},
  async list(libraryId,query='',offset=0,filters={}){
    const library=get().filter(d=>d.libraryId===libraryId).map(d=>({...d,...unpack(d.content).organization}));
    const counts=new Map<string,number>();for(const note of library)for(const tag of note.tags)counts.set(tag,(counts.get(tag)??0)+1);
    const all=library.filter(d=>(d.name+' '+unpack(d.content).body+' '+d.tags.join(' ')).toLowerCase().includes(query.toLowerCase())&&(!filters.tag||d.tags.includes(filters.tag))&&(!filters.color||d.color===filters.color)&&(!filters.pinned||d.pinned))
      .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(filters.sort==='title'?a.name.localeCompare(b.name):(b.modifiedAt??0)-(a.modifiedAt??0)));
    return {items:all.slice(offset,offset+100),total:all.length,nextOffset:all.length>offset+100?offset+100:null,facets:{total:library.length,pinned:library.filter(d=>d.pinned).length,tags:[...counts].map(([name,count])=>({name,count}))}};
  },
  async read(id){if(state.readDelay) await new Promise(r=>setTimeout(r,state.readDelay));const d=get().find(d=>d.id===id);if(!d) throw Object.assign(new Error('Note not found'),{status:404});return d;},
  async create(input){const all=get();const exists=all.find(d=>d.libraryId===input.libraryId&&d.name===input.name);if(exists){if(exists.content===input.content)return exists;throw Object.assign(new Error('A note with this name already exists.'),{status:409});}const d={...input,id:crypto.randomUUID(),revision:await revision(input.content),size:input.content.length,modifiedAt:Math.floor(Date.now()/1000)};put([...all,d]);return d;},
  async save(id,input){if(state.saveDelay)await new Promise(r=>setTimeout(r,state.saveDelay));if(state.saveFails) throw new Error('Demo connection interrupted');const all=get(),at=all.findIndex(d=>d.id===id);if(at<0)throw new Error('Note not found');if(all[at].revision!==input.revision&&all[at].content!==input.content)throw Object.assign(new Error('This note changed elsewhere. Keep your draft or reload the saved version.'),{status:409});all[at]={...all[at],content:input.content,revision:await revision(input.content),modifiedAt:Math.floor(Date.now()/1000),size:input.content.length};put(all);return all[at];},
  async delete(id,rev){const all=get(),d=all.find(d=>d.id===id);if(d?.revision!==rev)throw Object.assign(new Error('This note changed elsewhere.'),{status:409});put(all.filter(d=>d.id!==id));},
}};
activate(host).mount(document.querySelector('#app')!);
