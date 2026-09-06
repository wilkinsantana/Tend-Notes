<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Check, FileText, X } from 'lucide-svelte';
  import { renderDocument } from './markdown';
  import { NOTE_TEMPLATES, type NoteTemplate } from './templates';

  let { select, close }: { select: (template: NoteTemplate) => void; close: () => void } = $props();
  let chosenId = $state(NOTE_TEMPLATES[0].id);
  let dialog = $state<HTMLDivElement>();
  let previousFocus: HTMLElement | null = null;
  const chosen = $derived(NOTE_TEMPLATES.find((template) => template.id === chosenId) ?? NOTE_TEMPLATES[0]);
  const preview = $derived(renderDocument(chosen.content));

  function controls() {
    return [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])];
  }

  function trapFocus(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = controls();
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function choose(template: NoteTemplate) {
    chosenId = template.id;
  }

  function useTemplate() {
    select(chosen);
  }

  function keepDialogFocus(event: PointerEvent) {
    // The backdrop is intentionally inert. Prevent it from taking focus away
    // from the dialog, so Escape remains available after an accidental click.
    if (event.target === event.currentTarget) event.preventDefault();
  }

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(() => dialog?.querySelector<HTMLButtonElement>('[data-template]')?.focus());
    return () => previousFocus?.focus();
  });
</script>

<div class="template-overlay" role="presentation" onpointerdown={keepDialogFocus}>
  <div bind:this={dialog} class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-picker-title" tabindex="-1" onkeydown={trapFocus}>
    <header>
      <span class="template-mark"><FileText size={21}/></span>
      <div><h2 id="template-picker-title">Start with a template</h2><p>Choose a portable Markdown starting point. You can edit every line.</p></div>
      <button class="close" type="button" aria-label="Close template picker" onclick={close}><X size={19}/></button>
    </header>

    <div class="template-content">
      <div class="template-list" aria-label="Note templates">
        {#each NOTE_TEMPLATES as template}
          <button data-template type="button" class:chosen={template.id === chosenId} aria-pressed={template.id === chosenId} onclick={() => choose(template)}>
            <strong>{template.name}</strong>
            <span>{template.description}</span>
            {#if template.id === chosenId}<Check size={16} aria-label="Selected"/>{/if}
          </button>
        {/each}
      </div>
      <section class="template-preview" aria-live="polite" aria-label={`${chosen.name} preview`}>
        <small>Preview</small>
        <div class="rendered-preview">{@html preview.html}</div>
      </section>
    </div>

    <footer><button class="secondary" type="button" onclick={close}>Cancel</button><button class="primary" type="button" onclick={useTemplate}>Use template</button></footer>
  </div>
</div>

<style>
  .template-overlay{position:absolute;inset:0;z-index:21;display:grid;place-items:center;padding:20px;background:color-mix(in srgb,var(--ink) 24%,transparent);backdrop-filter:blur(4px)}
  .template-dialog{width:min(740px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 80px #0005;padding:26px;text-align:left}
  header{display:flex;align-items:flex-start;gap:11px;margin-bottom:20px;flex-shrink:0}.template-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--accent) 14%,var(--paper));color:var(--accent);flex-shrink:0}h2{font-size:20px;letter-spacing:-.4px;line-height:1.2;margin:0;font-weight:600}header p{font-size:11px;line-height:1.6;color:var(--soft);margin:4px 0 0}.close{display:grid;place-items:center;margin-left:auto;padding:7px;border:0;background:transparent;color:var(--ink);border-radius:7px}.close:hover{background:var(--wash)}
  .template-content{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(260px,1.1fr);gap:16px;flex:1;min-height:0;overflow:auto}.template-list{display:grid;gap:7px;align-content:start}.template-list button{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:var(--wash);color:var(--ink);text-align:left}.template-list button:hover,.template-list button.chosen{border-color:color-mix(in srgb,var(--accent) 65%,var(--line));background:color-mix(in srgb,var(--accent) 10%,var(--wash))}.template-list strong{font-size:12px;font-weight:600}.template-list span{grid-column:1;font-size:10px;line-height:1.45;color:var(--soft)}.template-list :global(svg){grid-column:2;grid-row:1 / span 2;align-self:center;color:var(--accent)}
  .template-preview{min-width:0;border:1px solid var(--line);border-radius:9px;background:var(--wash);overflow:hidden}.template-preview small{display:block;padding:9px 12px;border-bottom:1px solid var(--line);font-size:10px;color:var(--soft);letter-spacing:.04em;text-transform:uppercase}.rendered-preview{min-height:100%;max-height:340px;overflow:auto;padding:13px;font-size:11px;line-height:1.65;overflow-wrap:anywhere}.rendered-preview :global(h1),.rendered-preview :global(h2),.rendered-preview :global(h3){margin:0 0 .6em;line-height:1.35}.rendered-preview :global(h1){font-size:1.5em}.rendered-preview :global(h2){font-size:1.2em;margin-top:1.15em}.rendered-preview :global(h3){font-size:1.05em}.rendered-preview :global(p){margin:.45em 0}.rendered-preview :global(ul),.rendered-preview :global(ol){margin:.45em 0;padding-left:20px}.rendered-preview :global(input){accent-color:var(--accent);margin:0 5px 0 0}.rendered-preview :global(input:disabled){opacity:1}.rendered-preview :global(li){margin:.2em 0}
  footer{display:flex;justify-content:flex-end;gap:9px;margin-top:20px;padding-top:18px;border-top:1px solid var(--line);flex-shrink:0}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:10px 13px;font-size:11px;border:1px solid var(--line)}.primary{border-color:transparent;background:var(--accent);color:var(--accent-ink)!important}.secondary{background:var(--wash);color:var(--ink)}
  :is(button):focus-visible{outline:2px solid var(--accent);outline-offset:3px}@container(max-width:620px){.template-overlay{padding:10px}.template-dialog{padding:20px}.template-content{grid-template-columns:1fr}.template-list{grid-template-columns:repeat(2,minmax(0,1fr))}.rendered-preview{min-height:140px}}@container(max-width:350px){.template-list{grid-template-columns:1fr}header p{font-size:10px}}@media(prefers-reduced-motion:reduce){.template-overlay{backdrop-filter:none}}
</style>
