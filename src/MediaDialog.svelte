<script lang="ts">
  import { onDestroy } from 'svelte';
  import { X, Mic, Square, Upload, ImagePlus, Youtube, Trash2, FileText } from 'lucide-svelte';
  import type { Documents } from './host';
  import { youtubeId } from './markdown';
  let {kind,documents,noteId,insert,close}: {kind:'image'|'youtube'|'audio'|'document';documents:Documents;noteId:string;insert:(markdown:string)=>void;close:()=>void}=$props();
  let url=$state(''), label=$state(''), error=$state(''), busy=$state(false), requesting=$state(false), recording=$state(false), stopping=$state(false), seconds=$state(0);
  let recordingBlob=$state<Blob|null>(null), recordingUrl=$state('');
  let recorder: MediaRecorder|undefined, stream: MediaStream|undefined, timer: ReturnType<typeof setInterval>|undefined, alive=true;
  const MAX=20*1024*1024;
  const text=(value:string)=>value.replace(/[\[\]\\\r\n]/g,' ').trim();
  function disposeRecording() { clearInterval(timer); if(recorder?.state==='recording'){stopping=true;recorder.stop();} stream?.getTracks().forEach(t=>t.stop()); }
  function discard() { if(recordingUrl)URL.revokeObjectURL(recordingUrl);recordingUrl='';recordingBlob=null;seconds=0; }
  onDestroy(()=>{alive=false;disposeRecording();discard();});
  async function record() {
    if(recording || stopping || requesting || busy) return;
    if(!documents.attachments){error='Update Tend to save audio attachments.';return;}
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){error='Recording is unavailable in this browser. Open Notes over HTTPS or upload an audio file.';return;}
    requesting=true;error='';discard();
    try {
      const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!alive){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;
      const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
      const current=new MediaRecorder(acquired,mime?{mimeType:mime,audioBitsPerSecond:96000}:undefined);
      recorder=current;let durationTimer: ReturnType<typeof setInterval>|undefined;
      const chunks:Blob[]=[];let bytes=0;
      current.ondataavailable=e=>{if(e.data.size){bytes+=e.data.size;chunks.push(e.data);if(bytes>MAX)disposeRecording();}};
      current.onstop=()=>{clearInterval(durationTimer);acquired.getTracks().forEach(t=>t.stop());if(!alive || recorder!==current)return;recording=false;stopping=false;const blob=new Blob(chunks,{type:current.mimeType || 'audio/webm'});if(blob.size>MAX){error='Recording exceeds 20 MB. Record a shorter clip.';return;}recordingBlob=blob;recordingUrl=URL.createObjectURL(blob);};
      current.onerror=()=>{error='Recording was interrupted. Check your microphone and try again.';disposeRecording();};
      current.start(1000);recording=true;
      timer=durationTimer=setInterval(()=>{seconds++;if(seconds>=300)disposeRecording();},1000);
    } catch(e){stream?.getTracks().forEach(t=>t.stop());error=e instanceof Error?e.message:'Microphone access was unavailable.';}
    finally{requesting=false;}
  }
  async function upload(file:Blob) {
    if(!documents.attachments){error='Update Tend to save attachments.';return;}
    if(!file.size || file.size>MAX){error='Choose a nonempty file up to 20 MB.';return;}
    busy=true;error='';
    try { const result=await documents.attachments.upload(noteId,file);if(alive)insert(`${kind==='image'?'!':''}[${text(label)|| (file instanceof File && text(file.name)) || (kind==='image'?'Image':kind==='document'?'PDF document':'Audio note')}](${result.path})`); }
    catch(e){if(alive)error=e instanceof Error?e.message:'Upload failed. Try again.';}
    finally{busy=false;}
  }
  function addLink() {
    try {
      const parsed=new URL(url.trim());
      if(parsed.protocol!=='https:' || parsed.username || parsed.password)throw new Error('Use an HTTPS link without credentials.');
      if(kind==='youtube'&&!youtubeId(parsed.href))throw new Error('Paste a YouTube watch, share, or Shorts link.');
      insert(`${kind==='image'?'!':''}[${text(label)||(kind==='youtube'?'YouTube video':'Image')}](${parsed.href.replace(/[()]/g,c=>c==='('?'%28':'%29')})`);
    }catch(e){error=e instanceof Error?e.message:'Check the link and try again.';}
  }
  function focusDialog(node:HTMLElement) {
    const previous=document.activeElement as HTMLElement;
    queueMicrotask(()=>node.querySelector<HTMLElement>('input,button')?.focus());
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){e.stopPropagation();close();}if(e.key==='Tab'){const controls=[...node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),audio')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    node.addEventListener('keydown',key);return{destroy(){node.removeEventListener('keydown',key);previous?.focus();}};
  }
</script>
<div class="media-layer" role="presentation"><div class="media-dialog" role="dialog" aria-modal="true" aria-label={kind==='youtube'?'Insert YouTube video':kind==='image'?'Insert image':kind==='document'?'Attach PDF':'Insert audio'} tabindex="-1" use:focusDialog>
  <button class="close" aria-label="Close media dialog" onclick={close} disabled={busy}><X size={18}/></button>
  {#if kind==='image'}<ImagePlus size={25}/>{:else if kind==='youtube'}<Youtube size={27}/>{:else if kind==='document'}<FileText size={25}/>{:else}<Mic size={25}/>{/if}
  <h2>{kind==='image'?'Add an image':kind==='youtube'?'Add a video':kind==='document'?'Attach a PDF':'Keep a voice note'}</h2>
  <label>{kind==='document'?'Filename':'Description'}<input aria-label={kind==='document'?'PDF filename':'Media description'} bind:value={label} placeholder={kind==='document'?'Leave blank to use the PDF filename':kind==='audio'?'What is this recording about?':'A useful description'} maxlength="160" disabled={busy}/></label>
  {#if kind!=='audio' && kind!=='document'}<form onsubmit={e=>{e.preventDefault();addLink();}}><label>{kind==='youtube'?'YouTube link':'Image link'}<input aria-label={kind==='youtube'?'YouTube link':'Image link'} type="url" maxlength="2048" bind:value={url} placeholder="https://" required disabled={busy}/></label><small>External content loads only when you choose to view it.</small><button class="primary" disabled={busy||!url.trim()}>Insert link</button></form>{/if}
  {#if kind!=='youtube'}
    <label class="file-label"><Upload size={16}/> {kind==='image'?'Upload an image':kind==='document'?'Choose a PDF':'Upload audio'}<input aria-label={kind==='image'?'Image file':kind==='document'?'PDF file':'Audio file'} type="file" accept={kind==='image'?'image/png,image/jpeg,image/gif,image/webp':kind==='document'?'application/pdf,.pdf':'audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,.webm'} disabled={busy||recording||!documents.attachments} onchange={e=>{const file=e.currentTarget.files?.[0];if(file)void upload(file);}}/></label>
    <small>{kind==='image'?'PNG, JPEG, GIF, or WebP':kind==='document'?'PDF only':'MP3, M4A, WAV, Ogg, or WebM'} · up to 20 MB. Stored with your Markdown and included in ZIP backups.</small>
    {#if !documents.attachments}<p role="status">Update Tend to enable uploads and recordings.</p>{/if}
  {/if}
  {#if kind==='audio'}<div class="recording-tools">{#if recording}<button class="record-stop" disabled={stopping} onclick={disposeRecording}><Square size={15}/> {stopping?'Finishing recording…':'Stop recording'} · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</button>{:else}<button onclick={()=>void record()} disabled={busy||requesting||!documents.attachments}><Mic size={16}/>{requesting?'Requesting microphone…':'Record audio'}</button>{/if}<small>Up to 5 minutes. Your microphone stops when you close this dialog.</small></div>
    {#if recordingBlob}<audio controls src={recordingUrl} aria-label="Recording preview"></audio><div class="recorded-actions"><button class="primary" disabled={busy} onclick={()=>void upload(recordingBlob!)}>Use recording</button><button aria-label="Discard recording" title="Discard recording" onclick={discard} disabled={busy}><Trash2 size={16}/></button></div>{/if}
  {/if}
  {#if busy}<p role="status">Saving attachment…</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}
</div></div>
<style>
  .media-layer{position:absolute;inset:0;z-index:12;background:color-mix(in srgb,var(--paper) 70%,transparent);backdrop-filter:blur(3px);display:grid;place-items:center;padding:18px}.media-dialog{position:relative;width:min(430px,100%);max-height:100%;overflow:auto;background:var(--paper);border:1px solid var(--line);border-radius:15px;padding:26px;color:var(--ink);box-shadow:0 20px 70px #0003}.media-dialog> :global(svg){color:var(--accent)}h2{font-size:21px;margin:12px 0 20px}label{display:block;font-size:12px;margin-top:14px}input{display:block;width:100%;background:var(--wash);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:10px;margin-top:6px}small{display:block;color:var(--soft);font-size:11px;margin:9px 0;line-height:1.6}button{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--wash);color:var(--ink);padding:9px 12px;border-radius:7px;font-size:12px}.close{position:absolute;top:12px;right:12px;border:0;background:none;padding:7px}.primary{background:var(--accent);color:var(--accent-ink);border-color:transparent}.file-label{border-top:1px solid var(--line);padding-top:18px}.file-label :global(svg){display:inline;vertical-align:middle;margin-right:5px}.file-label input{font-size:11px}.recording-tools{margin-top:18px}.record-stop{color:var(--danger)}audio{width:100%;margin:12px 0}.recorded-actions{display:flex;gap:8px}.error{font-size:12px;color:var(--danger);margin-top:15px}
</style>
