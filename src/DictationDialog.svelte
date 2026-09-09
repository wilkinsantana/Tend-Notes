<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Clipboard, CircleStop, LoaderCircle, MicOff, Speech, Trash2, X } from 'lucide-svelte';
  import type { DictationState } from './dictation';

  let {value, onstart, onstop, oncancel, oninsert, onclear, onclose}: {
    value: DictationState;
    onstart: () => unknown;
    onstop: () => unknown;
    oncancel: () => void;
    oninsert: () => void;
    onclear: () => void;
    onclose: () => void;
  } = $props();
  let copied = $state('');
  let seconds = $state(0);
  let startedAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const active = $derived(['starting', 'recording', 'stopping'].includes(value.phase));
  const finalText = $derived(value.finalSegments.join(' '));

  $effect(() => {
    clearInterval(timer);
    timer = undefined;
    if (value.phase === 'recording') {
      if (!startedAt) startedAt = Date.now();
      seconds = Math.floor((Date.now() - startedAt) / 1000);
      timer = setInterval(() => seconds = Math.floor((Date.now() - startedAt) / 1000), 1000);
    } else if (!active) startedAt = 0;
    return () => clearInterval(timer);
  });

  async function copy() {
    try { await navigator.clipboard.writeText(value.transcript); copied = 'Transcript copied.'; }
    catch { copied = 'Copy failed. Select the transcript and copy it manually.'; }
  }
  function discard() {
    if (value.transcript && !confirm('Discard this transcript? It has not been inserted into the note.')) return;
    onclear();
  }
  function close() {
    if (active) oncancel();
    onclose();
  }
  function focusDialog(node: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    queueMicrotask(() => node.querySelector<HTMLElement>('button:not(:disabled)')?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...node.querySelectorAll<HTMLElement>('button:not(:disabled),textarea')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    node.addEventListener('keydown', key);
    return {destroy() { node.removeEventListener('keydown', key); previous?.focus(); }};
  }
  onDestroy(() => clearInterval(timer));
</script>

<div class="dictation-layer" role="presentation">
  <div class="dictation-dialog" role="dialog" aria-modal="true" aria-label="Dictate text" tabindex="-1" use:focusDialog>
    <header><div><h2><Speech size={21}/> Dictate text</h2><p>{value.target ? `Transcript for ${value.target.noteName}` : 'Review speech before inserting it.'}</p></div><button class="close" aria-label={active ? 'Close and stop dictation' : 'Close dictation'} onclick={close}><X size={19}/></button></header>
    <div class="capture-status" class:recording={value.phase === 'recording'} role="status">
      {#if value.phase === 'starting'}<LoaderCircle class="spin" size={17}/> Requesting microphone…
      {:else if value.phase === 'recording'}<span class="record-dot"></span> Listening · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      {:else if value.phase === 'stopping'}<LoaderCircle class="spin" size={17}/> Finishing transcript…
      {:else if value.transcript}Transcript ready to review
      {:else}Your microphone starts only when you choose Start dictation.
      {/if}
    </div>
    <div class="transcript" aria-label="Dictation transcript">
      {#if finalText}<span>{finalText}</span>{/if}{#if value.partial}<span class="partial">{finalText ? ' ' : ''}{value.partial}</span>{/if}
      {#if !value.transcript}<span class="placeholder">Recognized words will appear here without changing your note.</span>{/if}
    </div>
    <p class="privacy">Audio is processed by the local speech model and is not saved as a recording. Inserting uses the note’s normal save and sync.</p>
    {#if value.error}<p class="error" role="alert">{value.error}</p>{/if}
    {#if copied}<p class="copy-status" role="status">{copied}</p>{/if}
    <div class="actions">
      {#if active}
        <button class="stop" onclick={() => void onstop()} disabled={value.phase !== 'recording'}><CircleStop size={16}/> {value.phase === 'stopping' ? 'Finishing…' : 'Stop and finish'}</button>
        <button onclick={oncancel}><MicOff size={16}/> Cancel capture</button>
      {:else if !value.transcript}
        <button class="primary" onclick={() => void onstart()}><Speech size={16}/> Start dictation</button>
      {:else}
        <button class="primary" onclick={oninsert}>Insert into note</button>
        <button onclick={() => void copy()}><Clipboard size={15}/> Copy</button>
        <button class="discard" onclick={discard}><Trash2 size={15}/> Discard transcript</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .dictation-layer{position:absolute;inset:0;z-index:45;padding:16px;display:grid;place-items:center;background:color-mix(in srgb,var(--paper) 68%,transparent);backdrop-filter:blur(3px)}.dictation-dialog{width:min(520px,100%);max-height:100%;overflow:auto;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:15px;padding:22px;box-shadow:0 20px 70px #0004}header{display:flex;align-items:flex-start;gap:12px}header>div{flex:1;min-width:0}h2,p{margin:0}h2{display:flex;align-items:center;gap:8px;font-size:19px}header p,.privacy{color:var(--soft);font-size:11px;line-height:1.6;margin-top:5px}.close{margin-left:auto;border:0;background:none;color:var(--ink);width:44px;height:44px}.capture-status{display:flex;align-items:center;gap:8px;min-height:35px;margin:17px 0 10px;color:var(--soft);font-size:11px}.capture-status.recording{color:var(--danger)}.record-dot{width:8px;height:8px;border-radius:50%;background:var(--danger);box-shadow:0 0 0 4px color-mix(in srgb,var(--danger) 18%,transparent)}.transcript{min-height:128px;max-height:260px;overflow:auto;padding:14px;background:var(--wash);border:1px solid var(--line);border-radius:9px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.7;user-select:text}.partial{color:var(--soft);font-style:italic}.placeholder{color:var(--soft)}.privacy{margin-top:10px}.error{color:var(--danger);font-size:11px;line-height:1.5;margin-top:11px}.copy-status{color:var(--accent);font-size:11px;margin-top:9px}.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:17px}.actions button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);border-radius:7px;padding:10px 12px;background:var(--wash);color:var(--ink);font-size:11px}.actions .primary{background:var(--accent);color:var(--accent-ink);border-color:transparent}.actions .stop{color:var(--danger)}.actions .discard{margin-left:auto}:global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){:global(.spin){animation:none}}@container(max-width:520px){.dictation-layer{padding:8px}.dictation-dialog{padding:17px}.actions button{flex:1;min-height:44px}.actions .discard{margin-left:0;flex-basis:100%}}
</style>
