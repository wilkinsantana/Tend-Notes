<script lang="ts">
  import { onMount } from 'svelte';
  import type { WritingSurface } from './proseWritingSurface';
  import type { WritingChange } from './writingSurface';
  import type { TextMatch } from './find';
  let { body, readOnly, matches, activeStart, onchange, onundo, onredo, Surface, surface = $bindable() }: {
    body: string; readOnly: boolean; matches: TextMatch[]; activeStart: number;
    onchange: (change: WritingChange) => void; onundo: () => void; onredo: () => void;
    Surface: typeof import('./proseWritingSurface').WritingSurface; surface?: WritingSurface;
  } = $props();
  let parent: HTMLDivElement;
  onMount(() => {
    const instance = new Surface(parent, { body, readOnly, onChange: onchange, onUndo: onundo, onRedo: onredo });
    surface = instance;
    return () => { instance.destroy(); surface = undefined; };
  });
  $effect(() => { if (surface && surface.body !== body) surface.setBody(body); });
  $effect(() => { surface?.setReadOnly(readOnly); });
  $effect(() => { surface?.setMatches(matches, activeStart); });
</script>
<div class="formatted-editor" bind:this={parent}></div>
<style>
  .formatted-editor { flex:1; min-width:0; height:100%; overflow:hidden; }
</style>
