<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import { Ellipsis } from 'lucide-svelte';
  let { tools }: { tools: Snippet[] } = $props();
  let root: HTMLDivElement;
  let measure: HTMLDivElement;
  let trigger: HTMLButtonElement;
  let count = $state(0);
  let open = $state(false);
  function layout() {
    const widths = [...measure.children].map(el => el.getBoundingClientRect().width);
    const available = root.clientWidth;
    const total = widths.reduce((sum, width) => sum + width + 4, -4);
    let used = 0, next = 0;
    for (const width of widths) {
      if (used + width > available - (total > available ? 48 : 0)) break;
      used += width + 4; next++;
    }
    count = next;
    if (next === tools.length) open = false;
  }
  async function toggle() {open=!open;if(open){await tick();root.querySelector<HTMLElement>('.overflow button:not(:disabled), .overflow select')?.focus();}}
  onMount(() => {
    const observer = new ResizeObserver(layout);
    observer.observe(root); observer.observe(measure);
    const dismiss = (event: PointerEvent) => {if(!root.contains(event.target as Node))open=false;};
    const choose=(event:MouseEvent)=>{if((event.target as Element).closest('.overflow button'))open=false;};
    root.addEventListener('click',choose);
    document.addEventListener('pointerdown',dismiss);
    layout();
    return ()=>{observer.disconnect();root.removeEventListener('click',choose);document.removeEventListener('pointerdown',dismiss);};
  });
</script>
<svelte:window onkeydown={event=>{if(event.key==='Escape'&&open){open=false;trigger?.focus();}}}/>
<div class="toolbar" bind:this={root}>
  <div class="measurement" bind:this={measure} inert aria-hidden="true">{#each tools as tool}<div class="tool">{@render tool()}</div>{/each}</div>
  <div class="row" role="group" aria-label="Markdown formatting">{#each tools.slice(0,count) as tool}<div class="tool">{@render tool()}</div>{/each}
    {#if count<tools.length}<button class="more-tools" bind:this={trigger} aria-label="More formatting options" title="More formatting options" aria-expanded={open} onclick={toggle}><Ellipsis size={20}/></button>{/if}
  </div>
  {#if open}<div class="overflow" role="group" aria-label="More formatting options">{#each tools.slice(count) as tool}<div class="tool">{@render tool()}</div>{/each}</div>{/if}
</div>
<style>
.toolbar{position:relative;min-width:0;width:100%}.row{display:flex;align-items:center;gap:4px;min-height:44px}.tool{display:flex;align-items:center;flex-shrink:0}.measurement{position:absolute;visibility:hidden;pointer-events:none;display:flex;width:max-content;gap:4px;height:0;overflow:hidden}.more-tools{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;margin-left:auto;border:0;border-radius:7px;background:var(--wash);color:var(--ink)}.overflow{position:absolute;top:calc(100% + 5px);right:0;z-index:9;display:flex;flex-wrap:wrap;gap:6px;padding:12px;max-width:100%;width:max-content;background:var(--paper);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 30px #0004;max-height:40vh;overflow:auto}
</style>
