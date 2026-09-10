<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Check, Download, LoaderCircle, Mic, Play, Square, Trash2, Upload, X } from 'lucide-svelte';
  import type { SpeechInstallProgress, SpeechPrivateVoice, SpeechPrivateVoices, SpeechTts } from './host';
  import { createSpeechPlayback } from './speechPlayback';

  let {tts, api, onchanged, onclose}: {tts: SpeechTts; api: SpeechPrivateVoices; onchanged: (voice?: SpeechPrivateVoice) => void|Promise<void>; onclose: () => void} = $props();
  let setup = $state<Awaited<ReturnType<SpeechPrivateVoices['getSetupState']>>|null>(null);
  let saved = $state<readonly SpeechPrivateVoice[]>([]);
  let loading = $state(true), phase = $state<'idle'|'preparing'|'creating'|'removing'|'previewing'>('idle');
  let progress = $state<SpeechInstallProgress|null>(null), error = $state(''), success = $state('');
  let label = $state(''), consent = $state(false), sampleName = $state('');
  let sampleWav = $state<ArrayBuffer|null>(null), memoryAudioBlob: Blob|null = null, sampleUrl = '';
  let sampleAudio: HTMLAudioElement|null = null;
  let operation: AbortController|null = null, previewPlayback: ReturnType<typeof createSpeechPlayback>|null = null, sampleTicket = 0;
  let recordState = $state<'idle'|'starting'|'recording'>('idle'), recordSeconds = $state(0);
  let recordTicket = 0, recordTimer: ReturnType<typeof setInterval>|null = null, recordRate = 0, recordSamples = 0;
  let finishingRecording = $state(false);
  let recordStream: MediaStream|null = null, recordContext: AudioContext|null = null, recordSource: MediaStreamAudioSourceNode|null = null, recordProcessor: ScriptProcessorNode|null = null, recordMute: GainNode|null = null;
  let recordChunks: Float32Array[] = [];
  let removeVoice = $state<SpeechPrivateVoice|null>(null), removeConfirmation = $state('');
  let alive = true;
  const percent = $derived(progress?.totalBytes ? Math.min(100,Math.round(progress.completedBytes/progress.totalBytes*100)) : 0);
  const busy = $derived(loading || phase !== 'idle' || recordState !== 'idle' || finishingRecording);
  const canCreate = $derived(!!sampleWav && !!label.trim() && consent && !busy && setup?.model === 'ready');
  const readableError = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;
  const languageName = (value:string) => value.toLowerCase().startsWith('english') ? 'English' : value.replace(/[_-]+/g,' ');

  function writeAscii(view: DataView, at: number, text: string) { for(let i=0;i<text.length;i++) view.setUint8(at+i,text.charCodeAt(i)); }
  function encodeWav(chunks: Float32Array[], count: number, sampleRate: number) {
    const wav = new ArrayBuffer(44+count*2), view = new DataView(wav);
    writeAscii(view,0,'RIFF'); view.setUint32(4,36+count*2,true); writeAscii(view,8,'WAVE'); writeAscii(view,12,'fmt ');
    view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); writeAscii(view,36,'data'); view.setUint32(40,count*2,true);
    let offset=44, remaining=count;
    for(const chunk of chunks){for(let i=0;i<chunk.length&&remaining;i++,remaining--){const value=Math.max(-1,Math.min(1,chunk[i]??0));view.setInt16(offset,value<0?value*0x8000:value*0x7fff,true);offset+=2;}}
    return wav;
  }
  function stopSamplePreview(){sampleAudio?.pause();sampleAudio=null;}
  function clearSample(){
    stopSamplePreview(); if(sampleUrl) URL.revokeObjectURL(sampleUrl); sampleUrl=''; memoryAudioBlob=null;
    if(sampleWav) new Uint8Array(sampleWav).fill(0); sampleWav=null; sampleName=''; consent=false;
  }
  function keepSample(wav: ArrayBuffer, name: string){
    clearSample(); sampleWav=wav; memoryAudioBlob=new Blob([wav],{type:'audio/wav'}); sampleUrl=URL.createObjectURL(memoryAudioBlob); sampleName=name; success=''; error='';
    if(!label.trim()) label=name.replace(/\.wav$/i,'').trim().slice(0,80)||'My voice';
  }
  async function load(){
    loading=true;error='';
    try{const [state,voices]=await Promise.all([api.getSetupState(),api.list()]);if(alive){setup=state;saved=voices;}}
    catch(cause){if(alive)error=readableError(cause,'Personal voices are unavailable. Try again.');}
    finally{if(alive)loading=false;}
  }
  async function prepare(){
    if(busy)return;const request=new AbortController();operation=request;phase='preparing';progress=null;error='';success='';
    try{await api.prepare({signal:request.signal,onProgress:next=>{if(alive&&operation===request)progress=next;}});const state=await api.getSetupState();if(alive&&operation===request)setup=state;}
    catch(cause){if(alive&&!request.signal.aborted)error=readableError(cause,'Voice creation could not be prepared. Try again.');}
    finally{if(operation===request){operation=null;if(alive)phase='idle';}}
  }
  function uploaded(event: Event){
    const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;
    if(file.size>10_000_000){error='Choose a PCM WAV file up to 10 MB.';return;}
    if(!/\.wav$/i.test(file.name)&&!['audio/wav','audio/x-wav','audio/wave'].includes(file.type)){error='Choose a PCM WAV file.';return;}
    const ticket=++sampleTicket;void file.arrayBuffer().then(wav=>{if(alive&&ticket===sampleTicket)keepSample(wav,file.name);else new Uint8Array(wav).fill(0);},cause=>{if(alive&&ticket===sampleTicket)error=readableError(cause,'The WAV file could not be read.');});
  }
  async function previewSample(){
    if(!sampleUrl||busy)return;stopSamplePreview();error='';
    try{const audio=new Audio(sampleUrl);sampleAudio=audio;audio.onended=()=>{if(sampleAudio===audio)sampleAudio=null;};await audio.play();}
    catch(cause){sampleAudio=null;error=readableError(cause,'The sample could not play.');}
  }
  async function cleanupRecording(){
    if(recordTimer){clearInterval(recordTimer);recordTimer=null;} recordProcessor?.disconnect();recordSource?.disconnect();recordMute?.disconnect();recordProcessor=null;recordSource=null;recordMute=null;
    recordStream?.getTracks().forEach(track=>track.stop());recordStream=null;const context=recordContext;recordContext=null;if(context)try{await context.close();}catch{}
  }
  async function stopRecording(keep: boolean){
    const ticket=++recordTicket;if(recordState==='idle')return;recordState='idle';finishingRecording=true;
    const chunks=recordChunks,count=recordSamples,rate=recordRate;recordChunks=[];recordSamples=0;recordRate=0;
    await cleanupRecording();finishingRecording=false;
    if(!keep||!alive||ticket!==recordTicket){chunks.forEach(chunk=>chunk.fill(0));return;}
    if(!rate||count<rate*.5){chunks.forEach(chunk=>chunk.fill(0));error='Record at least half a second before stopping.';return;}
    const wav=encodeWav(chunks,count,rate);chunks.forEach(chunk=>chunk.fill(0));keepSample(wav,'Recorded sample.wav');
  }
  async function startRecording(){
    if(busy||!navigator.mediaDevices?.getUserMedia){error='Microphone recording is unavailable here. You can upload a PCM WAV file instead.';return;}
    const ticket=++recordTicket;recordState='starting';recordSeconds=0;recordChunks=[];recordSamples=0;error='';success='';
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(!alive||ticket!==recordTicket){stream.getTracks().forEach(track=>track.stop());return;}
      recordStream=stream;const context=new AudioContext(),rate=context.sampleRate;recordContext=context;
      if(!Number.isFinite(rate)||rate<8000||rate>96000)throw Error('This microphone sample rate is unsupported. Upload a PCM WAV file instead.');
      await context.resume();if(!alive||ticket!==recordTicket){await cleanupRecording();return;}
      const source=context.createMediaStreamSource(stream);recordSource=source;const processor=context.createScriptProcessor(4096,1,1);recordProcessor=processor;const mute=context.createGain();recordMute=mute;mute.gain.value=0;
      recordRate=rate;recordState='recording';
      processor.onaudioprocess=event=>{if(recordState!=='recording'||finishingRecording)return;const channel=event.inputBuffer.getChannelData(0),limit=Math.floor(rate*30),remaining=limit-recordSamples;if(remaining<=0){void stopRecording(true);return;}const copy=new Float32Array(Math.min(channel.length,remaining));copy.set(channel.subarray(0,copy.length));recordChunks.push(copy);recordSamples+=copy.length;recordSeconds=recordSamples/rate;if(recordSamples>=limit)void stopRecording(true);};
      source.connect(processor);processor.connect(mute);mute.connect(context.destination);recordTimer=setInterval(()=>{if(recordState==='recording')recordSeconds=Math.min(30,recordSamples/rate);},200);
    }catch(cause){if(alive&&ticket===recordTicket)error=readableError(cause,'The microphone could not start. Check its permission and try again.');if(ticket===recordTicket){recordState='idle';await cleanupRecording();}}
  }
  function cancelOperation(){operation?.abort();operation=null;if(phase==='previewing')stopSavedPreview();if(alive)phase='idle';}
  async function createVoice(){
    if(!canCreate||!sampleWav)return;stopSamplePreview();const request=new AbortController();operation=request;phase='creating';error='';success='';
    try{const voice=await api.create({label:label.trim(),wav:sampleWav,signal:request.signal});if(!alive||operation!==request)return;const voices=await api.list();if(!alive||operation!==request)return;saved=voices;clearSample();label='';success=`${voice.label} is ready on this device.`;await onchanged(voice);}
    catch(cause){if(alive&&!request.signal.aborted)error=readableError(cause,'The personal voice could not be created. Check the sample and try again.');}
    finally{if(operation===request){operation=null;if(alive)phase='idle';}}
  }
  function stopSavedPreview(){operation?.abort();operation=null;tts.cancel();previewPlayback?.stop();previewPlayback=null;if(alive)phase='idle';}
  async function previewSaved(voice: SpeechPrivateVoice){
    if(busy)return;const request=new AbortController();operation=request;phase='previewing';error='';
    let playback:ReturnType<typeof createSpeechPlayback>;
    try{playback=createSpeechPlayback();}catch(cause){operation=null;phase='idle';error=readableError(cause,'Audio playback is unavailable.');return;}
    previewPlayback=playback;
    try{await playback.ready;await tts.previewVoice(voice.id,{signal:request.signal,onChunk:chunk=>playback.play(chunk)});await playback.drain();}
    catch(cause){if(alive&&!request.signal.aborted)error=readableError(cause,'The personal voice preview could not play.');}
    finally{if(operation===request){operation=null;previewPlayback?.stop();previewPlayback=null;if(alive)phase='idle';}}
  }
  async function confirmRemove(){
    const voice=removeVoice;if(!voice||removeConfirmation!==voice.label||busy)return;phase='removing';error='';
    try{await api.remove(voice.id);if(alive){saved=await api.list();removeVoice=null;removeConfirmation='';await onchanged();}}
    catch(cause){if(alive)error=readableError(cause,'The personal voice could not be removed.');}
    finally{if(alive)phase='idle';}
  }
  function focusDialog(node:HTMLElement){const previous=document.activeElement as HTMLElement|null;queueMicrotask(()=>node.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled)')?.focus());const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}if(event.key!=='Tab')return;const controls=[...node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')].filter(control=>control.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};node.addEventListener('keydown',key);return{destroy(){node.removeEventListener('keydown',key);queueMicrotask(()=>previous?.focus());}};}
  function close(){++sampleTicket;cancelOperation();void stopRecording(false);clearSample();onclose();}
  onMount(()=>{void load();});
  onDestroy(()=>{alive=false;++sampleTicket;cancelOperation();void stopRecording(false);clearSample();});
</script>

<div class="voice-layer" role="presentation"><div class="voice-dialog" role="dialog" aria-modal="true" aria-label="Create my voice" tabindex="-1" use:focusDialog>
  <header><div><h2>Create my voice</h2><p>Use your own voice or one you have permission to use. The sample and personal voice stay on this device.</p></div><button class="icon-close" aria-label="Close Create my voice" onclick={close}><X size={19}/></button></header>
  {#if loading}<div class="loading" role="status"><LoaderCircle class="spin" size={18}/> Opening personal voices…</div>
  {:else}
    {#if setup?.model !== 'ready'}<section><h3>Prepare voice creation</h3><p>A one-time download of about {Math.ceil((setup?.modelBytes.total ?? 0)/1024/1024)} MB is needed before this device can create a personal reading voice. It starts only when you choose.</p>{#if phase==='preparing'}<div class="progress-copy"><span>{progress?.phase ?? 'Preparing'}…</span><span>{progress?.totalBytes?`${percent}%`:''}</span></div><progress max={progress?.totalBytes||1} value={progress?.completedBytes||0}></progress><button onclick={cancelOperation}>Cancel</button>{:else}<button class="primary" onclick={()=>void prepare()} disabled={busy}><Download size={15}/> Prepare voice creation</button>{/if}</section>
    {:else}<section><h3>Add a short sample</h3><p>Speak naturally for 5–15 seconds. Record up to 30 seconds, or upload a PCM WAV file up to 10 MB.</p><div class="sample-actions"><button onclick={()=>void startRecording()} disabled={busy}><Mic size={15}/> Record sample</button><label class:disabled={busy} for="personal-voice-wav"><Upload size={15}/> Upload WAV</label><input id="personal-voice-wav" class="sr-only" type="file" accept=".wav,audio/wav,audio/x-wav" onchange={uploaded} disabled={busy}/></div>
      {#if recordState==='starting'}<div class="recording" role="status"><LoaderCircle class="spin" size={16}/> Asking for microphone permission… <button onclick={()=>void stopRecording(false)}>Cancel</button></div>
      {:else if recordState==='recording'}<div class="recording" role="status"><span class="record-dot"></span> Recording {recordSeconds.toFixed(1)}s of 30s <button onclick={()=>void stopRecording(true)}><Square size={14}/> Stop recording</button><button onclick={()=>void stopRecording(false)}>Cancel recording</button></div>{/if}
      {#if sampleWav}<div class="sample-ready"><Check size={16}/><span><strong>Sample ready</strong><small>{sampleName}</small></span><button onclick={()=>void previewSample()} disabled={busy}><Play size={14}/> Preview sample</button><button onclick={clearSample} disabled={busy}>Replace</button></div>
        <label for="personal-voice-label">Voice name</label><input id="personal-voice-label" maxlength="80" bind:value={label} placeholder="My reading voice" disabled={busy}/>
        <label class="consent"><input type="checkbox" bind:checked={consent} disabled={busy}/> Use your own voice or one you have permission to use</label>
        {#if phase==='creating'}<div class="working" role="status"><LoaderCircle class="spin" size={16}/> Creating your voice…</div><button onclick={cancelOperation}>Cancel</button>{:else}<button class="primary" onclick={()=>void createVoice()} disabled={!canCreate}>Create my voice</button>{/if}
      {/if}
    </section>{/if}
    {#if saved.length}<section><h3>Personal voices on this device</h3><div class="saved-list">{#each saved as voice (voice.id)}<div class="saved"><div><strong>{voice.label}</strong><small>{languageName(voice.language)} · {new Date(voice.createdAt).toLocaleDateString()}</small></div><button onclick={()=>void previewSaved(voice)} disabled={busy}><Play size={14}/> Preview</button><button class="remove" onclick={()=>{removeVoice=voice;removeConfirmation='';}} disabled={busy}><Trash2 size={14}/> Remove</button></div>{/each}</div></section>{/if}
    {#if removeVoice}<section class="confirm"><h3>Remove “{removeVoice.label}”?</h3><p>This removes the personal voice from this device. Your notes do not change.</p><label for="confirm-personal-voice">Type {removeVoice.label} to confirm</label><input id="confirm-personal-voice" bind:value={removeConfirmation}/><div><button onclick={()=>{removeVoice=null;removeConfirmation='';}} disabled={phase==='removing'}>Keep voice</button><button class="remove" onclick={()=>void confirmRemove()} disabled={phase==='removing'||removeConfirmation!==removeVoice.label}>{phase==='removing'?'Removing…':`Remove ${removeVoice.label}`}</button></div></section>{/if}
    {#if phase==='previewing'}<button class="stop-preview" onclick={stopSavedPreview}><Square size={14}/> Stop preview</button>{/if}
    {#if success}<p class="success" role="status">{success}</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}
  {/if}
</div></div>

<style>
  .voice-layer{position:absolute;inset:0;z-index:3;padding:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--paper) 68%,transparent);backdrop-filter:blur(3px)}.voice-dialog{width:min(560px,100%);max-height:100%;overflow:auto;padding:20px;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:14px;box-shadow:0 20px 70px #0004}header{display:flex;align-items:flex-start;gap:12px}header>div{flex:1}h2,h3,p{margin:0}h2{font-size:19px}h3{font-size:14px}header p,section p{margin-top:5px;color:var(--soft);font-size:11px;line-height:1.55}.icon-close{width:44px;height:44px;border:0;background:none;color:var(--ink)}section{margin-top:16px;padding:15px;border:1px solid var(--line);border-radius:10px;background:var(--wash)}button,.sample-actions label{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;padding:8px 11px;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--ink);font-size:11px;cursor:pointer}.primary{margin-top:12px;border-color:transparent;background:var(--accent);color:var(--accent-ink)}button:disabled,.disabled{opacity:.45;cursor:not-allowed}.sample-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.sample-ready,.recording,.working,.loading{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:11px}.sample-ready>span,.saved>div{display:grid;flex:1;min-width:0}.sample-ready small,.saved small{color:var(--soft);font-size:10px;overflow:hidden;text-overflow:ellipsis}.record-dot{width:8px;height:8px;border-radius:50%;background:var(--danger)}label{display:block;margin-top:12px;font-size:11px}input[type="text"],input:not([type]){width:100%}#personal-voice-label,#confirm-personal-voice{box-sizing:border-box;width:100%;margin-top:5px;padding:10px;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--ink)}.consent{display:flex;align-items:flex-start;gap:7px;line-height:1.4}.consent input{margin-top:1px;accent-color:var(--accent)}.saved-list{display:grid;gap:7px;margin-top:11px}.saved{display:flex;align-items:center;gap:7px;padding:8px;border-radius:8px;background:var(--paper)}.remove,.error{color:var(--danger)}.confirm>div{display:flex;gap:7px;margin-top:10px}.success{margin-top:13px;color:var(--accent);font-size:11px}.error{margin-top:13px;font-size:11px;line-height:1.45}.progress-copy{display:flex;justify-content:space-between;margin-top:12px;color:var(--soft);font-size:10px}progress{display:block;width:100%;height:8px;margin:7px 0 11px;accent-color:var(--accent)}.stop-preview{margin-top:12px}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}:global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){:global(.spin){animation:none}}@container(max-width:520px){.voice-layer{padding:6px}.voice-dialog{padding:16px}.sample-actions>*{flex:1}.saved{align-items:stretch;flex-wrap:wrap}.saved>div{flex-basis:100%}.saved button{flex:1}button,.sample-actions label{min-height:44px}#personal-voice-label,#confirm-personal-voice{font-size:16px}}
</style>
