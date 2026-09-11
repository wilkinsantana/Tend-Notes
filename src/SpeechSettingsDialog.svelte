<script module lang="ts">
  // Scope browsing preferences to the host capability, never another account.
  const pickerMemory = new WeakMap<object, {voice: string; language: string}>();
</script>
<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { Check, Download, LoaderCircle, Play, Speech as SpeechIcon, Settings2, Trash2, Volume2, X } from 'lucide-svelte';
  import type { Speech, SpeechInstallProgress, SpeechNativeReading, SpeechNativeSession, SpeechNativeVoice, SpeechTts, SpeechVoice } from './host';
  import { createSpeechPlayback } from './speechPlayback';
  import CreateVoiceDialog from './CreateVoiceDialog.svelte';

  type TtsState = Awaited<ReturnType<SpeechTts['getInstallState']>>;
  function switchableNative(value: SpeechTts|undefined): SpeechNativeReading|null { return value?.native && typeof value.getReadingMode === 'function' && typeof value.setReadingMode === 'function' ? value.native : null; }
  function initialReadingMode(value: SpeechTts|undefined): 'device'|'download' { const available=switchableNative(value);if(!available)return 'download';try{return value!.getReadingMode!();}catch{return available.isMobile?'device':'download';} }
  let {speech, section = 'all', onstatus, onttsstatus, onreadingstatus, onclose}: {speech: Speech; section?: 'all'|'dictation'|'tts'; onstatus: (status: {installed: boolean; bytes: number}) => void; onttsstatus: (status: TtsState | null) => void; onreadingstatus: (mode: 'device'|'download', voices: readonly SpeechNativeVoice[]) => void; onclose: () => void} = $props();
  const tts = $derived(speech.tts);
  const native = $derived.by<SpeechNativeReading|null>(() => switchableNative(tts));
  let engineRevision = $state(0);
  const voices = $derived.by(() => { engineRevision; return readingMode === 'download' ? tts?.listVoices() ?? [] : []; });
  const pickerOwner = untrack(() => speech.tts);
  const rememberedPicker = pickerOwner ? pickerMemory.get(pickerOwner) : undefined;
  let selectedVoice = $state(rememberedPicker?.voice ?? '');
  let selectedLanguage = $state(rememberedPicker?.language ?? '');
  const languageCode = (locale: string) => locale.split(/[-_]/)[0].toLowerCase();
  const voiceLanguages = $derived([...new Set(voices.map(voice => languageCode(voice.locale)))].sort());
  const filteredVoices = $derived(voices.filter(voice => !selectedLanguage || languageCode(voice.locale) === selectedLanguage));
  function languageName(code: string) { try { return new Intl.DisplayNames(['en'], {type:'language'}).of(code) ?? code; } catch { return code; } }
  function selectLanguage() {
    if (!filteredVoices.some(voice => voice.id === selectedVoice)) selectedVoice = filteredVoices[0]?.id ?? '';
  }
  let temperature = $state(0.7);
  const generationSettings = $derived.by(() => { engineRevision; return readingMode === 'download' ? tts?.getGenerationSettings?.() ?? null : null; });
  let installed = $state(false), bytes = $state(0), received = $state(0), total = $state(0);
  let loading = $state(true), installing = $state(false), removing = $state(false), error = $state('');
  let controller: AbortController | null = null;
  let ttsState = $state<TtsState | null>(null), ttsLoading = $state(true);
  let ttsTask = $state<'model'|'voice'|'remove-model'|'remove-voice'|'preview'|''>('');
  let ttsProgress = $state<SpeechInstallProgress | null>(null), ttsError = $state('');
  let ttsController: AbortController | null = null;
  let previewPlayback: ReturnType<typeof createSpeechPlayback> | null = null;
  let nativePreview: SpeechNativeSession | null = null;
  let readingMode = $state<'device'|'download'>(initialReadingMode(speech.tts));
  let deviceVoices = $state<readonly SpeechNativeVoice[]>([]), selectedDeviceVoice = $state(''), selectedDeviceLanguage = $state('');
  const deviceLanguages = $derived([...new Set(deviceVoices.map(voice=>voice.lang))]);
  const visibleDeviceVoices = $derived(deviceVoices.filter(voice=>!selectedDeviceLanguage||voice.lang===selectedDeviceLanguage));
  let nativeLoading = $state(false), nativeError = $state('');
  let nativeResult = $state('');
  let modeError = $state('');
  let catalogOpen = $state(false), catalogLoading = $state(false), catalogError = $state('');
  let libraryState = $state<{ready:boolean;bytes:number;voices:readonly SpeechVoice[]}|null>(null);
  let voiceDialogOpen = $state(false);
  let voiceDialogTrigger = $state<HTMLButtonElement>();
  let alive = true;
  const allBusy = $derived(installing || removing || !!ttsTask);
  const blockingBusy = $derived(installing || removing || ['model','voice','remove-model','remove-voice'].includes(ttsTask));
  const percent = $derived(total > 0 ? Math.min(100, Math.round(received / total * 100)) : 0);
  const ttsPercent = $derived(ttsProgress?.totalBytes ? Math.min(100, Math.round(ttsProgress.completedBytes / ttsProgress.totalBytes * 100)) : 0);
  const chosenVoice = $derived(voices.find(voice => voice.id === selectedVoice));
  const voiceInstalled = $derived(!!selectedVoice && !!ttsState?.installedVoices.includes(selectedVoice));
  const size = (value: number) => value ? `${(value / 1_000_000).toFixed(1)} MB` : 'size unavailable';
  const PREVIEW_TEXT = 'This is how your notes will sound with this voice.';
  async function refresh() {
    loading = true; error = '';
    try { const status = await speech.status(); if (alive) { installed = status.installed; bytes = status.bytes; onstatus(status); } }
    catch (cause) { if (alive) error = cause instanceof Error ? cause.message : 'Speech status is unavailable. Try again.'; }
    finally { if (alive) loading = false; }
  }
  async function refreshTts() {
    if (!tts) { ttsLoading = false; onttsstatus(null); return; }
    ttsLoading = true; ttsError = '';
    try { const status = await tts.getInstallState(); if (alive) { engineRevision++; ttsState = status; temperature = tts.getGenerationSettings?.()?.temperature ?? 0.7; const available=tts.listVoices(); if(selectedLanguage && !available.some(voice=>languageCode(voice.locale)===selectedLanguage))selectedLanguage=''; const candidates=available.filter(voice=>!selectedLanguage||languageCode(voice.locale)===selectedLanguage); if(!candidates.some(voice=>voice.id===selectedVoice))selectedVoice=candidates.some(voice=>voice.id===status.defaultVoice)?status.defaultVoice:candidates[0]?.id??''; onttsstatus(status); } }
    catch (cause) { if (alive) ttsError = cause instanceof Error ? cause.message : 'Read-aloud status is unavailable. Try again.'; }
    finally { if (alive) ttsLoading = false; }
  }
  async function refreshNative() {
    if (!tts || !native) { readingMode = 'download'; deviceVoices = []; onreadingstatus('download', []); return; }
    nativeLoading = true; nativeError = ''; nativeResult = '';
    try {
      const voices = await native.refreshVoices();
      if (!alive) return;
      deviceVoices = [...voices]; readingMode = tts.getReadingMode!();
      const saved = tts.getDeviceVoice?.() ?? '';
      selectedDeviceVoice = voices.some(voice => voice.id === saved) ? saved : voices[0]?.id ?? '';
      selectedDeviceLanguage = voices.find(voice=>voice.id===selectedDeviceVoice)?.lang ?? voices[0]?.lang ?? '';
      if (selectedDeviceVoice && selectedDeviceVoice !== saved) tts.setDeviceVoice?.(selectedDeviceVoice);
      nativeResult = voices.length ? `${voices.length} local ${native.isMobile?'phone':'device'} ${voices.length===1?'voice':'voices'} found.` : `Checked just now. This browser did not return any local ${native.isMobile?'phone':'device'} voices.`;
    } catch (cause) { if (alive) { deviceVoices = []; try{readingMode=tts.getReadingMode!();}catch{readingMode=native.isMobile?'device':'download';} nativeError = cause instanceof Error ? cause.message : `${native.isMobile?'Phone':'Device'} voices are unavailable. Try again.`; } }
    finally { if (alive) { nativeLoading = false; onreadingstatus(readingMode, deviceVoices); } }
  }
  function setMode(mode: 'device'|'download') {
    if (!tts || !native || blockingBusy || ttsLoading || nativeLoading || readingMode === mode) return;
    stopTts(); nativeError = ''; modeError = '';
    try {
      tts.setReadingMode!(mode); readingMode = mode; onreadingstatus(mode, deviceVoices);
      if (mode === 'download') void refreshTts();
      else { catalogOpen=false; ttsLoading = false; onttsstatus(null); void refreshNative(); }
    }
    catch (cause) { modeError = cause instanceof Error ? cause.message : 'The reading choice could not be saved.'; }
  }
  function setDeviceVoice() {
    if (!tts || !selectedDeviceVoice || allBusy) return;
    try { tts.setDeviceVoice?.(selectedDeviceVoice); onreadingstatus(readingMode, deviceVoices); }
    catch (cause) { nativeError = cause instanceof Error ? cause.message : `The ${native?.isMobile?'phone':'device'} voice could not be changed.`; }
  }
  function setDeviceLanguage(){
    const next=visibleDeviceVoices[0];selectedDeviceVoice=next?.id??'';
    if(next)setDeviceVoice();
  }
  function saveTemperature() {
    if (!tts?.setGenerationSettings || allBusy || ttsLoading) return;
    try { tts.setGenerationSettings({temperature}); engineRevision++; }
    catch (cause) { ttsError = cause instanceof Error ? cause.message : 'Voice settings could not be saved.'; }
  }
  async function install() {
    if (allBusy) return;
    const request = new AbortController(); controller = request; installing = true; received = 0; total = bytes; error = '';
    try { await speech.install((next, expected) => { if (alive) { received = Math.max(0, next); total = Math.max(0, expected); } }, request.signal); if (alive) await refresh(); }
    catch (cause) { if (alive && !request.signal.aborted) error = cause instanceof Error ? cause.message : 'The dictation download could not be installed. Try again.'; }
    finally { if (controller === request) { controller = null; if (alive) installing = false; } }
  }
  function cancelInstall() { const request = controller; controller = null; request?.abort(); installing = false; error = 'Download cancelled. You can start it again whenever you are ready.'; }
  async function remove() {
    if (allBusy) return; removing = true; error = '';
    try { await speech.remove(); if (alive) { installed = false; received = 0; total = bytes; onstatus({installed: false, bytes}); } }
    catch (cause) { if (alive) error = cause instanceof Error ? cause.message : 'The dictation download could not be removed. Try again.'; }
    finally { if (alive) removing = false; }
  }
  function progress(next: SpeechInstallProgress) { if (alive) ttsProgress = next; }
  async function refreshVoiceLibrary() {
    if(!tts||readingMode!=='download')return;catalogLoading=true;catalogError='';
    try{const state=tts.getVoiceLibraryState?await tts.getVoiceLibraryState():{ready:ttsState?.model==='ready',bytes:ttsState?.modelBytes.total??0,voices:[...voices]};if(alive)libraryState=state;}
    catch(cause){if(alive)catalogError=cause instanceof Error?cause.message:'The voice library could not be refreshed.';}
    finally{if(alive)catalogLoading=false;}
  }
  function toggleCatalog(){catalogOpen=!catalogOpen;if(catalogOpen)void refreshVoiceLibrary();}
  function chooseCatalogVoice(id:string){if(!voices.some(voice=>voice.id===id))return;selectedVoice=id;ttsError='';}
  function catalogVoices(){
    const items=new Map<string,SpeechVoice>();
    for(const voice of voices)items.set(voice.id,voice);
    for(const voice of libraryState?.voices??[])items.set(voice.id,voice);
    return [...items.values()].filter(voice=>!selectedLanguage||languageCode(voice.locale)===selectedLanguage);
  }
  async function installModel() {
    if (!tts || allBusy) return;
    const request = new AbortController(); ttsController = request; ttsTask = 'model'; ttsProgress = null; ttsError = '';
    try { await tts.installModel({signal: request.signal, onProgress: progress}); if (alive) {await refreshTts();if(catalogOpen)await refreshVoiceLibrary();} }
    catch (cause) { if (alive && !request.signal.aborted) ttsError = cause instanceof Error ? cause.message : 'The reading download could not be installed. Try again.'; }
    finally { if (ttsController === request) { ttsController = null; if (alive) ttsTask = ''; } }
  }
  async function installVoice() {
    if (!tts || !selectedVoice || allBusy) return;
    const request = new AbortController(); ttsController = request; ttsTask = 'voice'; ttsProgress = null; ttsError = '';
    try { await tts.installVoice(selectedVoice, {signal: request.signal, onProgress: progress}); if (alive) await refreshTts(); }
    catch (cause) { if (alive && !request.signal.aborted) ttsError = cause instanceof Error ? cause.message : 'The voice could not be installed. Try again.'; }
    finally { if (ttsController === request) { ttsController = null; if (alive) ttsTask = ''; } }
  }
  async function removeModel() {
    if (!tts || allBusy) return; ttsTask = 'remove-model'; ttsError = '';
    try { await tts.removeModel(); if (alive) await refreshTts(); }
    catch (cause) { if (alive) ttsError = cause instanceof Error ? cause.message : 'The read-aloud download could not be removed.'; }
    finally { if (alive) ttsTask = ''; }
  }
  async function removeVoice() {
    if (!tts || !selectedVoice || allBusy) return; ttsTask = 'remove-voice'; ttsError = '';
    try { await tts.removeVoice(selectedVoice); if (alive) await refreshTts(); }
    catch (cause) { if (alive) ttsError = cause instanceof Error ? cause.message : 'The voice could not be removed.'; }
    finally { if (alive) ttsTask = ''; }
  }
  function setDefault() {
    if (!tts || !selectedVoice || !voiceInstalled || allBusy) return;
    try { tts.setDefaultVoice(selectedVoice); if (ttsState) { ttsState = {...ttsState, defaultVoice: selectedVoice}; onttsstatus(ttsState); } }
    catch (cause) { ttsError = cause instanceof Error ? cause.message : 'The default voice could not be changed.'; }
  }
  async function privateVoiceChanged(voice?: {id:string}) { await refreshTts(); if(alive&&voice){selectedVoice=voice.id; const selected=tts?.listVoices().find(item=>item.id===voice.id); if(selectedLanguage && selected && languageCode(selected.locale)!==selectedLanguage)selectedLanguage=languageCode(selected.locale);} }
  async function closeVoiceDialog(){voiceDialogOpen=false;await refreshTts();await tick();voiceDialogTrigger?.focus();}
  function stopTts(message = '') {
    const request = ttsController; ttsController = null; request?.abort(); tts?.cancel(); previewPlayback?.stop(); previewPlayback = null; nativePreview?.stop(); nativePreview = null;
    if (alive) { ttsTask = ''; if (message) ttsError = message; }
  }
  async function previewVoice() {
    if (!tts || !selectedVoice || !voiceInstalled || allBusy) return;
    stopTts();
    const request = new AbortController();
    let playback: ReturnType<typeof createSpeechPlayback>;
    try { playback = createSpeechPlayback(); }
    catch (cause) { ttsError = cause instanceof Error ? cause.message : 'Audio playback is unavailable in this browser.'; return; }
    ttsController = request; previewPlayback = playback; ttsTask = 'preview'; ttsError = '';
    try { await playback.ready; await tts.previewVoice(selectedVoice, {signal: request.signal, onChunk: chunk => playback.play(chunk)}); await playback.drain(); }
    catch (cause) { if (alive && !request.signal.aborted) ttsError = cause instanceof Error ? cause.message : 'The voice preview could not play.'; }
    finally { if (ttsController === request) { ttsController = null; previewPlayback?.stop(); previewPlayback = null; if (alive) ttsTask = ''; } }
  }
  async function previewDeviceVoice() {
    if (!native || !selectedDeviceVoice || allBusy) return;
    stopTts(); const request = new AbortController(); ttsController = request; ttsTask = 'preview'; nativeError = '';
    try {
      const preview = native.start({segments:[PREVIEW_TEXT], voice:selectedDeviceVoice, signal:request.signal});
      nativePreview = preview; await preview.done;
    } catch (cause) { if (alive && !request.signal.aborted) nativeError = cause instanceof Error ? cause.message : `The ${native.isMobile?'phone':'device'} voice preview could not play.`; }
    finally { if (ttsController === request) { ttsController = null; nativePreview?.stop(); nativePreview = null; if (alive) ttsTask = ''; } }
  }
  function cancelTtsDownload() { stopTts('Download cancelled. You can retry when you are ready.'); }
  function focusDialog(node: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    queueMicrotask(() => node.querySelector<HTMLElement>('button:not(:disabled)')?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !blockingBusy) { event.preventDefault(); event.stopPropagation(); stopTts(); onclose(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...node.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),summary')].filter(control => control.getClientRects().length > 0 && (!control.closest('details:not([open])') || control.matches('summary'))); const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    node.addEventListener('keydown', key); return {destroy() { node.removeEventListener('keydown', key); previous?.focus(); }};
  }
  function closeDialog() { if (blockingBusy) return; stopTts(); onclose(); }
  onMount(() => { void refresh(); if(readingMode === 'download') void refreshTts(); else { ttsLoading=false; onttsstatus(null); void refreshNative(); } });
  onDestroy(() => { if(pickerOwner && tts === pickerOwner) pickerMemory.set(pickerOwner, {voice:selectedVoice,language:selectedLanguage}); });
  onDestroy(() => { alive = false; controller?.abort(); stopTts(); });
</script>

<div class="speech-layer" role="presentation"><div class="speech-dialog" role="dialog" aria-modal="true" aria-label="Device speech settings" tabindex="-1" use:focusDialog inert={voiceDialogOpen}>
  <header><div><h2>{#if section === 'dictation'}<SpeechIcon size={22}/> Dictation{:else if section === 'tts'}<Volume2 size={22}/> Read aloud{:else}<Settings2 size={20}/> Device speech{/if}</h2><p>Audio and text are processed locally. Downloads happen only when you choose. Inserted transcripts still use normal Notes save and sync.</p></div><button class="close" aria-label="Close speech settings" onclick={closeDialog} disabled={blockingBusy}><X size={19}/></button></header>
  {#if section !== 'tts'}<div class="speech-card">
    <div class="card-title"><div><h3>Local dictation</h3><p>Turn speech into a transcript you review before inserting into a note.</p></div>{#if loading}<LoaderCircle class="spin" size={18}/>{:else if installed}<span class="ready"><Check size={15}/> Ready</span>{/if}</div>
    {#if installing}<div class="progress-copy"><span>Downloading dictation…</span><span>{total ? `${percent}% · ${size(received)} of ${size(total)}` : size(received)}</span></div><progress max={total || 1} value={received}></progress><button onclick={cancelInstall}>Cancel download</button>
    {:else if installed}<p class="details">Uses {size(bytes)} total, including the 45 MB recognition model. Removing it does not change your notes or inserted transcripts.</p><button class="remove" onclick={() => void remove()} disabled={allBusy}>{#if removing}<LoaderCircle class="spin" size={15}/> Removing…{:else}<Trash2 size={15}/> Remove dictation download{/if}</button>
    {:else if !loading}<p class="details">Downloads {size(bytes)} total, including the 45 MB recognition model. The host verifies all required files before dictation becomes available.</p><button class="download-action" onclick={() => void install()} disabled={allBusy}><Download size={15}/> Download local dictation</button>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
  {/if}
  {#if tts && section !== 'dictation'}<div class="speech-card">
    <div class="card-title"><div><h3>Listen to your notes</h3><p>Choose a voice for reading notes on this device.</p></div>{#if ttsLoading || nativeLoading}<LoaderCircle class="spin" size={18}/>{:else if readingMode === 'device' ? deviceVoices.length : ttsState?.model === 'ready'}<span class="ready"><Check size={15}/> Ready to read</span>{/if}</div>

    {#if native}<div class="reading-modes" role="group" aria-label="Reading voices"><button aria-pressed={readingMode === 'device'} onclick={() => setMode('device')} disabled={blockingBusy || ttsLoading || nativeLoading}>{native.isMobile?'Phone voices':'Device voices'}</button><button aria-pressed={readingMode === 'download'} onclick={() => setMode('download')} disabled={blockingBusy || ttsLoading || nativeLoading}>Downloaded voices</button></div><p class="details switch-hint">Switching changes which voices Notes uses. Existing downloads stay on this device.</p>{#if modeError}<p class="error" role="alert">{modeError}</p>{/if}{/if}
    {#if readingMode === 'download' && tts.privateVoices}<button class="create-voice" bind:this={voiceDialogTrigger} onclick={()=>{stopTts();voiceDialogOpen=true;}} disabled={allBusy || ttsLoading}><SpeechIcon size={15}/> Create my voice</button>{/if}
    {#if readingMode === 'device' && native}
      {#if nativeLoading}<p class="details" role="status">Finding voices already on this {native.isMobile?'phone':'device'}…</p>
      {:else if deviceVoices.length}<div class="voice-fields">{#if deviceLanguages.length>1}<label for="device-language">Language<select id="device-language" bind:value={selectedDeviceLanguage} onchange={setDeviceLanguage} disabled={!!ttsTask}>{#each deviceLanguages as language}<option value={language}>{language}</option>{/each}</select></label>{/if}<label for="device-voice">{native.isMobile?'Phone':'Device'} voice<select id="device-voice" bind:value={selectedDeviceVoice} onchange={setDeviceVoice} disabled={!!ttsTask}>{#each visibleDeviceVoices as voice}<option value={voice.id}>{voice.name} · {voice.lang}</option>{/each}</select></label></div><div class="voice-actions"><button onclick={() => void previewDeviceVoice()} disabled={!!ttsTask}><Play size={15}/> Preview</button></div>{#if nativeResult}<p class="check-result" role="status">{nativeResult}</p>{/if}{#if nativeError}<p class="error" role="alert">{nativeError}</p>{/if}
      {:else}<p class="details">No {native.isMobile?'phone':'device'} voices are available to Notes {native.isMobile?'on this device':'in this browser'}. Notes can only use local voices that this browser returns. Browsers do not always include voices, even when the device has a voice assistant. Downloaded reading works independently of the browser’s voice service.</p><details><summary>Why are there no device voices?</summary><p class="details">On Linux, Firefox-based browsers may need a working Speech Dispatcher service; Chromium builds may expose no voices at all. Browser privacy settings can also hide voices. On phones, check the system’s speech and language settings. Retry after changing those settings or restarting the browser. Notes cannot install or enable system voices.</p></details><div class="voice-actions empty-actions"><button onclick={() => void refreshNative()} disabled={allBusy}>Retry {native.isMobile?'phone':'device'} voices</button><button onclick={() => setMode('download')} disabled={allBusy}>Use downloaded reading</button></div>{#if nativeResult}<p class="check-result" role="status">{nativeResult}</p>{/if}{#if nativeError}<p class="error" role="alert">{nativeError}</p>{/if}{/if}
    {:else if ttsTask === 'model' || ttsTask === 'voice'}<div class="progress-copy"><span>{ttsProgress?.phase ?? 'Preparing'} {ttsTask === 'voice' ? 'voice' : 'reading download'}…</span><span>{ttsProgress?.totalBytes ? `${ttsPercent}% · ${size(ttsProgress.completedBytes)} of ${size(ttsProgress.totalBytes)}` : ''}</span></div><progress max={ttsProgress?.totalBytes || 1} value={ttsProgress?.completedBytes || 0}></progress><button onclick={cancelTtsDownload}>Cancel download</button>
    {:else if !ttsLoading && ttsState?.model !== 'ready'}<p class="details">Set up private reading on this device, then choose a voice. Nothing downloads until you ask.</p><button class="download-action" onclick={() => void installModel()} disabled={allBusy}><Download size={15}/> Set up reading {ttsState?.modelBytes.total ? `· ${size(ttsState.modelBytes.total)}` : ''}</button>
    {:else if ttsState?.model === 'ready'}
      <div class="voice-library-head"><div><h4>Downloaded voice</h4><p>Choose one here, or browse the full voice library.</p></div><button aria-expanded={catalogOpen} aria-controls="voice-catalog" onclick={toggleCatalog} disabled={blockingBusy}>{catalogOpen?'Hide voices':'Browse voices'}</button></div>
      <div class="voice-fields"><label for="speech-language">Language<select id="speech-language" aria-label="Language" bind:value={selectedLanguage} onchange={selectLanguage} disabled={!!ttsTask}><option value="">All available languages</option>{#each voiceLanguages as language}<option value={language}>{languageName(language)}</option>{/each}</select><small>Languages shown are supported by this voice library.</small></label><label for="speech-voice">Choose a voice<select id="speech-voice" bind:value={selectedVoice} disabled={!!ttsTask}>{#each filteredVoices as voice}<option value={voice.id}>{voice.name} · {voice.locale} · {ttsState.installedVoices.includes(voice.id) ? 'Downloaded' : 'Available'}</option>{/each}</select></label></div>
      {#if catalogOpen}<div id="voice-catalog" class="voice-catalog" role="region" aria-label="Voice library"><div class="catalog-head"><strong>Voice library</strong><button onclick={()=>void refreshVoiceLibrary()} disabled={catalogLoading||blockingBusy}>{#if catalogLoading}<LoaderCircle class="spin" size={14}/>{/if} Refresh list</button></div>
        {#if catalogError}<p class="error" role="alert">{catalogError}</p>{:else if catalogLoading && !libraryState}<p class="details" role="status">Checking available voices…</p>{:else if libraryState}
          {#if !libraryState.ready}<div class="library-setup"><div><strong>More voices are ready to browse</strong><p>Prepare the current voice library once. Your existing reading download stays in place.</p></div><button class="download-action inline-primary" onclick={()=>void installModel()} disabled={allBusy}><Download size={15}/> Prepare voice library{libraryState.bytes?` · ${size(libraryState.bytes)}`:''}</button></div>{/if}
          <div class="catalog-list">{#each catalogVoices() as voice (voice.id)}{@const downloaded=ttsState.installedVoices.includes(voice.id)}<button class="catalog-voice" class:selected={selectedVoice===voice.id} aria-pressed={selectedVoice===voice.id} onclick={()=>chooseCatalogVoice(voice.id)} disabled={!voices.some(item=>item.id===voice.id)||!!ttsTask}><span><strong>{voice.name}</strong><small>{voice.locale}</small></span><em class:downloaded>{voice.personal?'Personal':downloaded?'Downloaded':'Available'}</em></button>{/each}</div>
        {/if}
      </div>{/if}
      {#if chosenVoice}<p class="details">{chosenVoice.personal ? chosenVoice.grade : voiceInstalled ? 'Downloaded voice' : 'Available to download'}{ttsState.defaultVoice === chosenVoice.id ? ' · default voice' : ''}</p>{/if}
      <div class="voice-actions">{#if voiceInstalled}<button onclick={() => void previewVoice()} disabled={!!ttsTask}><Play size={15}/> Preview</button><button onclick={setDefault} disabled={!!ttsTask || ttsState.defaultVoice === selectedVoice}><Check size={15}/> Use by default</button>{#if !chosenVoice?.personal}<button class="remove" onclick={() => void removeVoice()} disabled={!!ttsTask}><Trash2 size={15}/> Remove voice</button>{/if}{:else}<button class="download-action inline-primary" onclick={() => void installVoice()} disabled={!selectedVoice || !!ttsTask}><Download size={15}/> Download voice</button>{/if}</div>
      <button class="remove model-remove" onclick={() => void removeModel()} disabled={!!ttsTask}><Trash2 size={15}/> Remove reading download</button>
    {/if}
    {#if ttsTask === 'preview'}<button class="stop-preview" onclick={() => stopTts()}><Volume2 size={15}/> Stop preview</button>{/if}
    {#if readingMode === 'download' && generationSettings && tts.setGenerationSettings}<details class="advanced"><summary>Advanced voice settings</summary><label for="speech-temperature">Voice variation · {temperature.toFixed(1)}</label><input id="speech-temperature" type="range" min="0.1" max="1.2" step="0.1" bind:value={temperature} onchange={saveTemperature} disabled={allBusy || ttsLoading}/><p class="details">Lower values favor consistency; higher values add variation. Default: 0.7. Applies to the next reading or preview.</p></details>{/if}
    {#if ttsError || ttsState?.error}<p class="error" role="alert">{ttsError || ttsState?.error}</p>{/if}
  </div>{/if}
  <small>{native?.isMobile?'Phone voices stay with the phone.':'Device voices are provided by this device and browser.'} Downloaded speech stays with this browser or desktop device. Neither belongs to a notebook.</small>
</div>{#if voiceDialogOpen && tts?.privateVoices}<CreateVoiceDialog tts={tts} api={tts.privateVoices} onchanged={privateVoiceChanged} onclose={closeVoiceDialog}/>{/if}</div>

<style>
  .advanced{margin-top:14px;font-size:12px}.advanced summary{cursor:pointer;padding:8px 0}.advanced input{width:100%;min-height:32px;accent-color:var(--accent)}.reading-modes{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:16px;padding:4px;border:1px solid var(--line);border-radius:9px;background:var(--wash)}.reading-modes button{border-color:transparent;background:transparent}.reading-modes button[aria-pressed="true"]{border-color:var(--line);background:var(--paper);color:var(--ink);box-shadow:0 1px 3px #0002}.switch-hint{margin-top:7px}.inline-primary{margin-top:0}.create-voice{margin-top:12px}.voice-library-head,.catalog-head,.library-setup{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}.voice-library-head h4{margin:0;font-size:12px}.voice-library-head p,.library-setup p{margin:2px 0 0;color:var(--soft);font-size:10px;line-height:1.45}.voice-fields{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.3fr);gap:10px}.voice-fields label{min-width:0}.voice-fields small{display:block;margin-top:5px;color:var(--soft);font-size:9px;line-height:1.4}.voice-catalog{margin-top:10px;padding:11px;border:1px solid var(--line);border-radius:9px;background:var(--paper)}.catalog-head{margin:0}.catalog-list{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.catalog-voice{justify-content:space-between;text-align:left}.catalog-voice>span{display:grid;min-width:0}.catalog-voice small{color:var(--soft);font-size:9px;overflow:hidden;text-overflow:ellipsis}.catalog-voice em{font-style:normal;color:var(--soft);font-size:9px}.catalog-voice em.downloaded,.catalog-voice.selected{color:var(--accent)}.library-setup{align-items:flex-start;padding:10px;border-radius:8px;background:var(--wash)}
  .speech-layer{position:absolute;inset:0;z-index:40;padding:16px;display:grid;place-items:center;background:color-mix(in srgb,var(--paper) 68%,transparent);backdrop-filter:blur(3px)}.speech-dialog{width:min(540px,100%);max-height:100%;overflow:auto;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:15px;padding:22px;box-shadow:0 20px 70px #0004}header,.card-title{display:flex;align-items:flex-start;gap:12px}header>div,.card-title>div{flex:1;min-width:0}h2,h3,p{margin:0}h2{display:flex;align-items:center;gap:8px;font-size:19px}h3{font-size:14px}header p,.card-title p,.details,small{color:var(--soft);font-size:11px;line-height:1.65;margin-top:5px}.close{margin-left:auto;border:0;background:none;color:var(--ink);width:44px;height:44px}.speech-card{margin:20px 0 14px;padding:17px;background:var(--wash);border:1px solid var(--line);border-radius:11px}.ready{display:inline-flex;align-items:center;gap:5px;color:var(--accent);font-size:11px;white-space:nowrap}.progress-copy{display:flex;justify-content:space-between;gap:12px;margin-top:16px;color:var(--soft);font-size:10px}.progress-copy span:last-child{text-align:right}progress{display:block;width:100%;height:8px;margin:9px 0 13px;accent-color:var(--accent)}label{display:block;margin-top:14px;font-size:11px}select{box-sizing:border-box;display:block;width:100%;min-height:44px;margin-top:6px;padding:10px;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:7px}button{display:inline-flex;align-items:center;justify-content:center;gap:7px;box-sizing:border-box;min-height:44px;border:1px solid var(--line);border-radius:7px;padding:9px 12px;background:var(--paper);color:var(--ink);font-size:11px}.primary{background:var(--accent);color:var(--accent-ink);border-color:transparent;margin-top:13px}.download-action{margin-top:13px;border-color:color-mix(in srgb,var(--warning,#d7ac64) 72%,var(--ink));background:var(--warning,#d7ac64);color:var(--color-warning-content,#211704)}.check-result{margin-top:9px;color:var(--soft);font-size:10px;line-height:1.45}.remove{color:var(--danger)}.speech-card>.remove,.model-remove,.stop-preview{margin-top:13px}.voice-actions{display:flex;align-items:stretch;gap:7px;flex-wrap:wrap;margin-top:12px}.voice-actions button{min-height:44px}.empty-actions>button{flex:1;height:44px;max-height:44px;padding-inline:8px;font-size:10px;white-space:nowrap}.error{color:var(--danger);font-size:11px;line-height:1.5;margin-top:13px}button:disabled{opacity:.45}:global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){:global(.spin){animation:none}}@container(max-width:520px){.speech-layer{padding:8px}.speech-dialog{padding:17px}select{font-size:16px}.voice-fields,.catalog-list{grid-template-columns:1fr}.voice-library-head,.library-setup{align-items:stretch;flex-direction:column}.voice-library-head button,.library-setup button{width:100%;min-height:44px}.progress-copy{display:block}.progress-copy span{display:block;text-align:left!important}.voice-actions button{flex:1}}
</style>
