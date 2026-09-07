<script lang="ts">
  import { onMount } from 'svelte';
  import { Search, ChevronUp, ChevronDown, CaseSensitive, X } from 'lucide-svelte';
  import { findInNote, type TextMatch } from './find';
  let { body, initialQuery = '', initialStart = 0, onselect, onclose, onmatches }: {
    body: string; initialQuery?: string; initialStart?: number;
    onselect: (match: TextMatch) => void; onclose: () => void;
    onmatches: (matches: TextMatch[], activeStart: number) => void;
  } = $props();
  let query = $state('');
  let matchCase = $state(false);
  let activeStart = $state(-1);
  let anchor = 0;
  let input: HTMLInputElement;
  const result = $derived(findInNote(body, query, matchCase));
  const activeIndex = $derived(result.matches.findIndex(match => match.start === activeStart));
  const count = $derived(!query ? 'Find in this note' : !result.matches.length ? 'No matches' :
    `${activeIndex < 0 ? '–' : activeIndex + 1} / ${result.matches.length.toLocaleString()}${result.truncated ? '+' : ''}`);

  $effect(() => { onmatches(result.matches, activeStart); });

  export function focusQuery() { input?.focus(); input?.select(); }
  function choose(index: number) {
    const match = result.matches[index];
    if (!match) { activeStart = -1; return; }
    activeStart = match.start; anchor = match.start;
    onselect(match);
  }
  function changed() {
    const next = result.matches.findIndex(match => match.start >= anchor);
    choose(next < 0 ? 0 : next);
  }
  function navigate(direction: number) {
    const length = result.matches.length;
    if (!length) return;
    if (activeIndex >= 0) choose((activeIndex + direction + length) % length);
    else if (direction > 0) changed();
    else {
      let previous = length - 1;
      for (let index = length - 1; index >= 0; index--) {
        if (result.matches[index].start < anchor) { previous = index; break; }
      }
      choose(previous);
    }
  }
  function keyboard(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onclose(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault(); event.stopPropagation(); input?.focus(); input?.select();
    } else if (event.key === 'Enter' && event.currentTarget === input) {
      event.preventDefault(); navigate(event.shiftKey ? -1 : 1);
    }
  }
  onMount(() => {
    query = initialQuery; anchor = initialStart;
    changed(); input?.focus(); input?.select();
  });
</script>

<form class="find-bar" role="search" aria-label="Find in note" onsubmit={event => event.preventDefault()}>
  <Search size={15} aria-hidden="true"/>
  <input bind:this={input} aria-label="Find text in note" placeholder="Find in this note…" maxlength="256" value={query}
    oninput={event => { query = event.currentTarget.value; changed(); }} onkeydown={keyboard}/>
  <span class="match-count" role="status" title={result.truncated ? 'Showing the first 10,000 matches. Narrow your search to find a later match.' : undefined}>{count}</span>
  <div class="find-actions">
    <button type="button" aria-label="Match case" aria-pressed={matchCase} class:chosen={matchCase} title="Match case" onclick={() => { matchCase = !matchCase; changed(); }} onkeydown={keyboard}><CaseSensitive size={17}/></button>
    <button type="button" aria-label="Previous match" title="Previous match · Shift+Enter" disabled={!result.matches.length} onclick={() => navigate(-1)} onkeydown={keyboard}><ChevronUp size={17}/></button>
    <button type="button" aria-label="Next match" title="Next match · Enter" disabled={!result.matches.length} onclick={() => navigate(1)} onkeydown={keyboard}><ChevronDown size={17}/></button>
    <button type="button" aria-label="Close find" title="Close find · Escape" onclick={onclose} onkeydown={keyboard}><X size={16}/></button>
  </div>
</form>

<style>
  .find-bar{display:flex;align-items:center;gap:8px;padding:6px 14px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--wash) var(--tend-panel-surface-alpha,100%),transparent);color:var(--soft);flex-shrink:0;min-width:0}
  input{flex:1;min-width:40px;width:100%;border:0;border-radius:5px;background:var(--paper);color:var(--ink);padding:6px 8px;font:inherit;font-size:12px}
  input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .match-count{font-size:10px;white-space:nowrap;min-width:54px;text-align:right}
  .find-actions{display:flex;gap:1px;flex-shrink:0}
  button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:5px;background:none;color:inherit;cursor:pointer}
  button:hover{background:var(--paper);color:var(--ink)}button.chosen{background:color-mix(in srgb,var(--accent) 12%,var(--paper));color:var(--accent)}button:disabled{opacity:.4;cursor:default}
  @container(max-width:480px){.find-bar{gap:4px;padding:6px 9px;flex-wrap:wrap}.find-bar>input{flex-basis:calc(100% - 25px)}.match-count{margin-left:21px;text-align:left;flex:1}.find-actions{margin-left:auto}}
</style>
