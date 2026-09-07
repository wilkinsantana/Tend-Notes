<script lang="ts">
  import { onMount } from 'svelte';
  import { Download, Palette, Pin, TextCursorInput, Trash2 } from 'lucide-svelte';

  let { name, pinned, x, y, returnFocus, disabled = false, onclose, onrename, onpin, oncolor, onexport, ondelete }: {
    name: string;
    pinned: boolean;
    x: number;
    y: number;
    returnFocus: HTMLElement | null;
    disabled?: boolean;
    onclose: () => void;
    onrename: () => void;
    onpin: () => void;
    oncolor: () => void;
    onexport: () => void;
    ondelete: () => void;
  } = $props();

  let menu: HTMLDivElement;
  let left = $state(0);
  let top = $state(0);

  function close(restoreFocus = true) {
    // Restore before invoking an action so a newly opened dialog owns focus.
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    onclose();
  }

  function choose(action: () => void) {
    if (disabled) return;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    action();
    onclose();
  }

  const items = () => [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];

  function keydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    const buttons = items();
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      next = buttons.findIndex((_, offset) => buttons[(index + 1 + offset) % buttons.length].textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()));
      if (next < 0) return;
      next = (index + 1 + next) % buttons.length;
    } else return;
    event.preventDefault();
    buttons[next].focus();
  }

  onMount(() => {
    const box = menu.getBoundingClientRect();
    left = Math.max(8, Math.min(x, window.innerWidth - box.width - 8));
    top = Math.max(8, Math.min(y, window.innerHeight - box.height - 8));
    (items()[0] ?? menu).focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) close(false); };
    const scroll = (event: Event) => { if (!menu.contains(event.target as Node)) close(); };
    const dismiss = () => close();
    const blur = () => close(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', blur);
    };
  });
</script>

<div class="note-context-menu" bind:this={menu} role="menu" aria-label={`Actions for ${name}`} tabindex="-1" style:left={`${left}px`} style:top={`${top}px`} onkeydown={keydown} oncontextmenu={event => event.preventDefault()}>
  <button type="button" role="menuitem" tabindex="-1" {disabled} onclick={() => choose(onrename)}><TextCursorInput size={15}/><span>Rename</span></button>
  <button type="button" role="menuitem" tabindex="-1" {disabled} onclick={() => choose(onpin)}><Pin size={15}/><span>{pinned ? 'Unpin' : 'Pin'}</span></button>
  <button type="button" role="menuitem" tabindex="-1" {disabled} onclick={() => choose(oncolor)}><Palette size={15}/><span>Note color</span></button>
  <button type="button" role="menuitem" tabindex="-1" {disabled} onclick={() => choose(onexport)}><Download size={15}/><span>Export Markdown</span></button>
  <div class="separator" role="separator"></div>
  <button type="button" class="delete" role="menuitem" tabindex="-1" {disabled} onclick={() => choose(ondelete)}><Trash2 size={15}/><span>Delete</span></button>
</div>

<style>
  .note-context-menu{position:fixed;z-index:20;box-sizing:border-box;width:min(196px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;padding:5px;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 30px #0005}
  button{display:flex;align-items:center;gap:9px;width:100%;border:0;border-radius:6px;padding:9px 10px;background:transparent;color:inherit;font:inherit;font-size:12px;line-height:1.3;text-align:left;cursor:pointer}
  button:hover,button:focus-visible{background:var(--wash);outline:2px solid var(--accent);outline-offset:-2px}
  button:disabled{opacity:.45;cursor:default}
  button :global(svg){flex-shrink:0;color:var(--soft)}
  .delete,.delete :global(svg){color:var(--danger)}
  .separator{height:1px;background:var(--line);margin:4px 5px}
</style>
