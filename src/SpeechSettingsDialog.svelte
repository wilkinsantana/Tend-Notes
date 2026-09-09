<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Check, Download, LoaderCircle, Play, Settings2, Trash2, Volume2, X } from 'lucide-svelte';
  import type { Speech, SpeechInstallProgress, SpeechTts } from './host';
  import { createSpeechPlayback } from './speechPlayback';

  type TtsState = Awaited<ReturnType<SpeechTts['getInstallState']>>;
  let {speech, onstatus, onttsstatus, onclose}: {speech: Speech; onstatus: (status: {installed: boolean; bytes: number}) => void; onttsstatus: (status: TtsState | null) => void; onclose: () => void} = $props();
  const tts = $derived(speech.tts);
  const voices = $derived(tts?.listVoices() ?? []);
  let selectedVoice = $state('');
  let installed = $state(false), bytes = $state(0), received = $state(0), total = $state(0);
  let loading = $state(true), installing = $state(false), removing = $state(false), error = $state('');
  let controller: AbortController | null = null;
  let ttsState = $state<TtsState | null>(null), ttsLoading = $state(true);
  let ttsTask = $state<'model'|'voice'|'remove-model'|'remove-voice'|'preview'|''>('');
  let ttsProgress = $state<SpeechInstallProgress | null>(null), ttsError = $state('');
  let ttsController: AbortController | null = null;
  let previewPlayback: ReturnType<typeof createSpeechPlayback> | null = null;
  let alive = true;
  const allBusy = $derived(installing || removing || !!ttsTask);
  const percent = $derived(total > 0 ? Math.min(100, Math.round(received / total * 100)) : 0);
  const ttsPercent = $derived(ttsProgress?.totalBytes ? Math.min(100, Math.round(ttsProgress.completedBytes / ttsProgress.totalBytes * 100)) : 0);
  const chosenVoice = $derived(voices.find(voice => voice.id === selectedVoice));
  const voiceInstalled = $derived(!!selectedVoice && !!ttsState?.installedVoices.includes(selectedVoice));
  const size = (value: number) => value ? `${(value / 1_000_000).toFixed(1)} MB` : 'size unavailable';
  $effect(() => { if (!selectedVoice) selectedVoice = tts?.getDefaultVoice() || voices[0]?.id || ''; });

  async function refresh() {
    loading = true; error = '';
    try { const status = await speech.status(); if (alive) { installed = status.installed; bytes = status.bytes; onstatus(status); } }
    catch (cause) { if (alive) error = cause instanceof Error ? cause.message : 'Speech status is unavailable. Try again.'; }
    finally { if (alive) loading = false; }
  }
  async function refreshTts() {
    if (!tts) { ttsLoading = false; onttsstatus(null); return; }
    ttsLoading = true; ttsError = '';
    try { const status = await tts.getInstallState(); if (alive) { ttsState = status; selectedVoice ||= status.defaultVoice || voices[0]?.id || ''; onttsstatus(status); } }
    catch (cause) { if (alive) ttsError = cause instanceof Error ? cause.message : 'Read-aloud status is unavailable. Try again.'; }
    finally { if (alive) ttsLoading = false; }
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
  async function installModel() {
    if (!tts || allBusy) return;
    const request = new AbortController(); ttsController = request; ttsTask = 'model'; ttsProgress = null; ttsError = '';
    try { await tts.installModel({signal: request.signal, onProgress: progress}); if (alive) await refreshTts(); }
    catch (cause) { if (alive && !request.signal.aborted) ttsError = cause instanceof Error ? cause.message : 'The read-aloud model could not be installed. Try again.'; }
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
  function stopTts(message = '') {
    const request = ttsController; ttsController = null; request?.abort(); tts?.cancel(); previewPlayback?.stop(); previewPlayback = null;
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
    try { await playback.ready; await tts.previewVoice(selectedVoice, {signal: request.signal, onChunk: chunk => playback.play(chunk)}); }
    catch (cause) { if (alive && !request.signal.aborted) ttsError = cause instanceof Error ? cause.message : 'The voice preview could not play.'; }
    finally { if (ttsController === request) { ttsController = null; previewPlayback?.stop(); previewPlayback = null; if (alive) ttsTask = ''; } }
  }
  function cancelTtsDownload() { stopTts('Download cancelled. You can retry when you are ready.'); }
  function focusDialog(node: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    queueMicrotask(() => node.querySelector<HTMLElement>('button:not(:disabled)')?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !allBusy) { event.preventDefault(); event.stopPropagation(); onclose(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...node.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)')]; const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    node.addEventListener('keydown', key); return {destroy() { node.removeEventListener('keydown', key); previous?.focus(); }};
  }
  onMount(() => { void refresh(); void refreshTts(); });
  onDestroy(() => { alive = false; controller?.abort(); stopTts(); });
</script>

<div class="speech-layer" role="presentation"><div class="speech-dialog" role="dialog" aria-modal="true" aria-label="Device speech settings" tabindex="-1" use:focusDialog>
  <header><div><h2><Settings2 size={20}/> Device speech</h2><p>Audio and text are processed locally. Dictation downloads come from Moonshine AI; read-aloud models and voices come from its Hugging Face mirror; inserted transcripts still use normal Notes save and sync.</p></div><button class="close" aria-label="Close speech settings" onclick={onclose} disabled={allBusy}><X size={19}/></button></header>
  <div class="speech-card">
    <div class="card-title"><div><h3>Local dictation</h3><p>Turn speech into a transcript you review before inserting into a note.</p></div>{#if loading}<LoaderCircle class="spin" size={18}/>{:else if installed}<span class="ready"><Check size={15}/> Ready</span>{/if}</div>
    {#if installing}<div class="progress-copy"><span>Downloading dictation…</span><span>{total ? `${percent}% · ${size(received)} of ${size(total)}` : size(received)}</span></div><progress max={total || 1} value={received}></progress><button onclick={cancelInstall}>Cancel download</button>
    {:else if installed}<p class="details">Uses {size(bytes)} total, including the 45 MB recognition model. Removing it does not change your notes or inserted transcripts.</p><button class="remove" onclick={() => void remove()} disabled={allBusy}>{#if removing}<LoaderCircle class="spin" size={15}/> Removing…{:else}<Trash2 size={15}/> Remove dictation download{/if}</button>
    {:else if !loading}<p class="details">Downloads {size(bytes)} total, including the 45 MB recognition model. The host verifies all required files before dictation becomes available.</p><button class="primary" onclick={() => void install()} disabled={allBusy}><Download size={15}/> Download local dictation</button>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
  {#if tts}<div class="speech-card">
    <div class="card-title"><div><h3>Read aloud</h3><p>Listen to readable note text with an American or British English voice.</p></div>{#if ttsLoading}<LoaderCircle class="spin" size={18}/>{:else if ttsState?.model === 'ready'}<span class="ready"><Check size={15}/> Model ready</span>{/if}</div>
    {#if ttsTask === 'model' || ttsTask === 'voice'}<div class="progress-copy"><span>{ttsProgress?.phase ?? 'Preparing'} {ttsTask === 'voice' ? 'voice' : 'read-aloud model'}…</span><span>{ttsProgress?.totalBytes ? `${ttsPercent}% · ${size(ttsProgress.completedBytes)} of ${size(ttsProgress.totalBytes)}` : ''}</span></div><progress max={ttsProgress?.totalBytes || 1} value={ttsProgress?.completedBytes || 0}></progress><button onclick={cancelTtsDownload}>Cancel download</button>
    {:else if !ttsLoading && ttsState?.model !== 'ready'}<p class="details">Downloads the local voice model only when you choose. Voice files are separate so you keep only the voices you use.</p><button class="primary" onclick={() => void installModel()} disabled={allBusy}><Download size={15}/> Download read-aloud model {ttsState?.modelBytes.total ? `· ${size(ttsState.modelBytes.total)}` : ''}</button>
    {:else if ttsState?.model === 'ready'}
      <label for="speech-voice">Voice</label><select id="speech-voice" bind:value={selectedVoice} disabled={!!ttsTask}>{#each voices as voice}<option value={voice.id}>{voice.name} · {voice.locale} · {voice.grade}{ttsState.installedVoices.includes(voice.id) ? ' · downloaded' : ''}</option>{/each}</select>
      {#if chosenVoice}<p class="details">{chosenVoice.gender === 'female' ? 'Female' : 'Male'} · {size(chosenVoice.bytes)}{ttsState.defaultVoice === chosenVoice.id ? ' · default voice' : ''}</p>{/if}
      <div class="voice-actions">{#if voiceInstalled}<button onclick={() => void previewVoice()} disabled={!!ttsTask}><Play size={15}/> Preview</button><button onclick={setDefault} disabled={!!ttsTask || ttsState.defaultVoice === selectedVoice}><Check size={15}/> Use by default</button><button class="remove" onclick={() => void removeVoice()} disabled={!!ttsTask}><Trash2 size={15}/> Remove voice</button>{:else}<button class="primary" onclick={() => void installVoice()} disabled={!selectedVoice || !!ttsTask}><Download size={15}/> Download voice</button>{/if}</div>
      {#if ttsTask === 'preview'}<button class="stop-preview" onclick={() => stopTts()}><Volume2 size={15}/> Stop preview</button>{/if}
      <button class="remove model-remove" onclick={() => void removeModel()} disabled={!!ttsTask}><Trash2 size={15}/> Remove read-aloud model</button>
    {/if}
    {#if ttsError || ttsState?.error}<p class="error" role="alert">{ttsError || ttsState?.error}</p>{/if}
  </div>{/if}
  <small>Speech models belong to this browser or desktop device, not to a notebook. Clearing device data may remove them.</small>
</div></div>

<style>
  .speech-layer{position:absolute;inset:0;z-index:40;padding:16px;display:grid;place-items:center;background:color-mix(in srgb,var(--paper) 68%,transparent);backdrop-filter:blur(3px)}.speech-dialog{width:min(540px,100%);max-height:100%;overflow:auto;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:15px;padding:22px;box-shadow:0 20px 70px #0004}header,.card-title{display:flex;align-items:flex-start;gap:12px}header>div,.card-title>div{flex:1;min-width:0}h2,h3,p{margin:0}h2{display:flex;align-items:center;gap:8px;font-size:19px}h3{font-size:14px}header p,.card-title p,.details,small{color:var(--soft);font-size:11px;line-height:1.65;margin-top:5px}.close{margin-left:auto;border:0;background:none;color:var(--ink);width:44px;height:44px}.speech-card{margin:20px 0 14px;padding:17px;background:var(--wash);border:1px solid var(--line);border-radius:11px}.ready{display:inline-flex;align-items:center;gap:5px;color:var(--accent);font-size:11px;white-space:nowrap}.progress-copy{display:flex;justify-content:space-between;gap:12px;margin-top:16px;color:var(--soft);font-size:10px}.progress-copy span:last-child{text-align:right}progress{display:block;width:100%;height:8px;margin:9px 0 13px;accent-color:var(--accent)}label{display:block;margin-top:14px;font-size:11px}select{display:block;width:100%;margin-top:6px;padding:10px;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:7px}button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);border-radius:7px;padding:9px 12px;background:var(--paper);color:var(--ink);font-size:11px}.primary{background:var(--accent);color:var(--accent-ink);border-color:transparent;margin-top:13px}.remove{color:var(--danger)}.speech-card>.remove,.model-remove,.stop-preview{margin-top:13px}.voice-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.error{color:var(--danger);font-size:11px;line-height:1.5;margin-top:13px}button:disabled{opacity:.45}:global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){:global(.spin){animation:none}}@container(max-width:520px){.speech-layer{padding:8px}.speech-dialog{padding:17px}select{font-size:16px}button{min-height:44px}.progress-copy{display:block}.progress-copy span{display:block;text-align:left!important}.voice-actions button{flex:1}}
</style>
