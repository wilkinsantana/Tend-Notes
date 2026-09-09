<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Link, Copy, LoaderCircle } from 'lucide-svelte';
  import type { Documents, Note } from './host';
  import { noteLink, scanBacklinks, type BacklinkState } from './backlinks';
  let { documents, currentNoteId, onopen, onclose }: { documents: Documents; currentNoteId: string; onopen: (note: Note) => void; onclose: () => void } = $props();
  let scanState = $state<BacklinkState>({notes: [], scanned: 0, partial: false, done: false, cancelled: false, errors: 0});
  let copyMessage = $state('');
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;
  onMount(() => {
    const controller = new AbortController();
    void scanBacklinks(documents, currentNoteId, {signal: controller.signal, onprogress: next => { if (!controller.signal.aborted) scanState = next; }});
    return () => controller.abort();
  });
  async function copy() {
    try { await navigator.clipboard.writeText(noteLink(currentNoteId)); copyMessage = 'Link copied'; }
    catch { copyMessage = 'Could not copy. Clipboard permission may be unavailable.'; }
  }
</script>
<svelte:window onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); onclose(); } }}/>
<section class="backlinks" aria-label="Links to this note">
  <header><h2><Link size={18}/> Links to this note</h2><button aria-label="Close links to this note" title="Close" onclick={onclose}><X size={20}/></button></header>
  <p>Notes that link here. Results come from notebooks you can currently access.</p>
  <p>These links work in this Tend instance. Renaming, moving or exporting a note may break its link.</p>
  {#if canCopy}<button class="copy" onclick={() => void copy()}><Copy size={16}/> Copy link to this note</button>{/if}
  {#if copyMessage}<p role="status">{copyMessage}</p>{/if}
  <p role="status">{#if !scanState.done}<LoaderCircle size={14}/> Checking notes… {/if}{scanState.scanned} checked{#if scanState.partial} · Partial results{/if}</p>
  {#if scanState.partial}<p>Some notes could not be checked or the scan limit was reached. Offline results may be incomplete.</p>{/if}
  <ul>{#each scanState.notes as note (note.id)}<li><button onclick={() => onopen(note)}>{note.name}</button></li>{/each}</ul>
  {#if scanState.done && !scanState.notes.length}<p>No incoming links found{scanState.partial ? ' among the notes checked' : ''}.</p>{/if}
</section>
<style>
  .backlinks{padding:20px;min-width:0;overflow:auto;max-height:260px;flex-shrink:0;border-bottom:1px solid var(--line);color:var(--ink);background:var(--paper)}header{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{display:flex;align-items:center;gap:8px;font-size:16px;margin:0}p{font-size:13px;line-height:1.6;color:var(--soft);display:flex;align-items:center;gap:6px}button{font:inherit;color:var(--ink);background:var(--wash);border:1px solid var(--line);border-radius:8px;min-height:44px;padding:8px 12px;cursor:pointer}header button{min-width:44px}.copy{display:flex;align-items:center;gap:8px;font-size:13px}ul{list-style:none;padding:0}li{margin:8px 0}li button{width:100%;text-align:left;overflow-wrap:anywhere}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
