<script lang="ts">
  import type { TextMatch } from './find';
  let { editor, body, matches, activeStart }: { editor: HTMLTextAreaElement; body: string; matches: TextMatch[]; activeStart: number } = $props();
  let viewport: HTMLDivElement;
  let mirror: HTMLDivElement;
  // Text only: no HTML parsing, persisted state, or events that intercept writing.
  const pieces = $derived.by(() => {
    const result: { text: string; match: boolean; active: boolean }[] = [];
    let end = 0;
    for (const match of matches) {
      result.push({ text: body.slice(end, match.start), match: false, active: false });
      result.push({ text: body.slice(match.start, match.end), match: true, active: match.start === activeStart });
      end = match.end;
    }
    result.push({ text: body.slice(end) + '\n', match: false, active: false });
    return result;
  });
  $effect(() => {
    const target = editor;
    if (!target || !viewport || !mirror) return;
    const sync = () => {
      const style = getComputedStyle(target);
      for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'textAlign', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'wordBreak', 'overflowWrap', 'direction'] as const) mirror.style[property] = style[property];
      const area = target.getBoundingClientRect();
      const parent = viewport.parentElement!.getBoundingClientRect();
      Object.assign(viewport.style, { left: `${area.left - parent.left}px`, top: `${area.top - parent.top}px`, width: `${area.width - (target.offsetWidth - target.clientWidth)}px`, height: `${area.height - (target.offsetHeight - target.clientHeight)}px` });
      mirror.style.transform = `translate(${-target.scrollLeft}px, ${-target.scrollTop}px)`;
    };
    sync();
    const resize = new ResizeObserver(sync); resize.observe(target);
    target.addEventListener('scroll', sync, { passive: true });
    const theme = new MutationObserver(sync);
    for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement) theme.observe(ancestor, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    return () => { resize.disconnect(); theme.disconnect(); target.removeEventListener('scroll', sync); };
  });
</script>

<div class="find-highlights" bind:this={viewport} aria-hidden="true"><div class="mirror" bind:this={mirror}>{#each pieces as piece}{#if piece.match}<mark class:active={piece.active}>{piece.text}</mark>{:else}{piece.text}{/if}{/each}</div></div>

<style>
  .find-highlights{position:absolute;pointer-events:none;overflow:hidden;z-index:1}
  .mirror{box-sizing:border-box;white-space:pre-wrap;color:transparent}
  mark{color:transparent;background:color-mix(in srgb,var(--accent) 22%,transparent);border-radius:2px}
  mark.active{background:color-mix(in srgb,var(--warning) 32%,transparent);outline:1px solid color-mix(in srgb,var(--warning) 65%,transparent)}
</style>
