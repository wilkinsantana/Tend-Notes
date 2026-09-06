<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Check, FileText, LoaderCircle, RefreshCw, X } from 'lucide-svelte';
  import { renderDocument } from './markdown';
  import { unpack } from './organization';
  import { listPersonalTemplates, readPersonalTemplate } from './personalTemplates';
  import { NOTE_TEMPLATES, type NoteTemplate } from './templates';
  import type { Documents, Note } from './host';

  let {
    select, selectPersonal, toggleCurrent, close, api, libraryId, currentPersonal,
    canToggleCurrent, hasCurrentNote, selectionBusy, actionBusy, actionError, refreshKey, isCurrent,
  }: {
    select: (template: NoteTemplate) => void;
    selectPersonal: (note: Note) => void;
    toggleCurrent: (enabled: boolean) => void;
    close: () => void;
    api: Documents;
    libraryId: string;
    currentPersonal: boolean;
    canToggleCurrent: boolean;
    hasCurrentNote: boolean;
    selectionBusy: boolean;
    actionBusy: boolean;
    actionError: string;
    refreshKey: number;
    isCurrent: () => boolean;
  } = $props();

  let chosenId = $state(NOTE_TEMPLATES[0].id);
  let dialog = $state<HTMLDivElement>();
  let previousFocus: HTMLElement | null = null;
  let mounted = false;
  let request = 0;
  let listedRefresh = -1;
  let personal = $state<Note[]>([]);
  let personalNext = $state<number | null>(null);
  let personalPages = $state(0);
  let personalLoading = $state(false);
  let personalError = $state('');
  let previewTicket = 0;
  let selectedPersonal = $state<{note: Note; template: NoteTemplate} | null>(null);
  let personalPreviewLoading = $state(false);
  let personalPreviewError = $state('');
  const chosen = $derived(NOTE_TEMPLATES.find((template) => template.id === chosenId) ?? NOTE_TEMPLATES[0]);
  const shownTemplate = $derived(selectedPersonal?.template ?? chosen);
  const preview = $derived(renderDocument(unpack(shownTemplate.content).body));
  const useDisabled = $derived(actionBusy || selectionBusy || personalPreviewLoading || (!!personalPreviewError && !selectedPersonal));

  function controls() {
    return [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])];
  }
  function trapFocus(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(); return;
    }
    if (event.key !== 'Tab') return;
    const items = controls();
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  function choose(template: NoteTemplate) {
    previewTicket += 1; personalPreviewLoading = false; personalPreviewError = ''; selectedPersonal = null; chosenId = template.id;
  }
  function templateName(note: Note) { return note.name.replace(/\.(md|markdown)$/i, ''); }
  function useTemplate() {
    if (selectedPersonal) selectPersonal(selectedPersonal.note);
    else select(chosen);
  }
  function keepDialogFocus(event: PointerEvent) {
    if (event.target === event.currentTarget) event.preventDefault();
  }
  async function loadPersonal(append = false) {
    if (append && personalLoading) return;
    const offset = append ? personalNext : 0;
    if (offset === null) return;
    if (append && personalPages >= 20) {
      personalError = 'Templates are too numerous to load safely. Refine the notebook and try again.';
      return;
    }
    const ticket = ++request;
    personalLoading = true; personalError = '';
    try {
      const page = await listPersonalTemplates(api, libraryId, offset);
      if (!mounted || ticket !== request || !isCurrent()) return;
      personal = append ? [...personal, ...page.items] : page.items;
      personalNext = page.nextOffset;
      personalPages = append ? personalPages + 1 : 1;
    } catch (error) {
      if (mounted && ticket === request && isCurrent()) personalError = error instanceof Error ? error.message : 'Your templates could not be loaded. Try again.';
    } finally {
      if (mounted && ticket === request) personalLoading = false;
    }
  }
  function retryPersonal() { void loadPersonal(false); }
  async function previewPersonal(note: Note) {
    if (selectionBusy || personalPreviewLoading) return;
    const ticket = ++previewTicket;
    personalPreviewLoading = true; personalPreviewError = ''; selectedPersonal = null;
    try {
      const template = await readPersonalTemplate(api, note);
      if (!mounted || ticket !== previewTicket || !isCurrent()) return;
      selectedPersonal = {note, template};
    } catch (error) {
      if (mounted && ticket === previewTicket && isCurrent()) personalPreviewError = error instanceof Error ? error.message : 'This template could not be read. Refresh Templates and try again.';
    } finally {
      if (mounted && ticket === previewTicket) personalPreviewLoading = false;
    }
  }

  $effect(() => {
    const refresh = refreshKey;
    if (!mounted || listedRefresh === refresh) return;
    listedRefresh = refresh;
    void loadPersonal(false);
  });

  onMount(() => {
    mounted = true;
    listedRefresh = refreshKey;
    void loadPersonal(false);
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(() => dialog?.querySelector<HTMLButtonElement>('[data-template]')?.focus());
    return () => { mounted = false; request += 1; previewTicket += 1; previousFocus?.focus(); };
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
        <section aria-labelledby="built-in-templates"><h3 id="built-in-templates">Built-in templates</h3>
          {#each NOTE_TEMPLATES as template}
            <button data-template type="button" class:chosen={!selectedPersonal && template.id === chosenId} aria-pressed={!selectedPersonal && template.id === chosenId} disabled={selectionBusy} onclick={() => choose(template)}>
              <strong>{template.name}</strong>
              <span>{template.description}</span>
              {#if !selectedPersonal && template.id === chosenId}<Check size={16} aria-label="Selected"/>{/if}
            </button>
          {/each}
        </section>

        <section class="your-templates" aria-labelledby="your-templates"><div class="section-heading"><h3 id="your-templates">Your templates</h3><button class="icon-button" type="button" aria-label="Refresh your templates" title="Refresh your templates" disabled={personalLoading} onclick={retryPersonal}><RefreshCw size={14} class={personalLoading ? 'spin' : ''}/></button></div>
          <p>Your saved Markdown notes. Selecting one reads a fresh copy first.</p>
          {#if personalLoading && !personal.length}<p role="status">Loading your templates…</p>{/if}
          {#each personal as note (note.id)}
            <button type="button" class="personal-template" class:chosen={selectedPersonal?.note.id === note.id} aria-pressed={selectedPersonal?.note.id === note.id} disabled={selectionBusy || personalPreviewLoading} onclick={() => void previewPersonal(note)}><strong>{templateName(note)}</strong><span>Your reusable Markdown note.</span></button>
          {/each}
          {#if !personal.length && !personalLoading && !personalError}<p class="empty">Add a note below to reuse it here.</p>{/if}
          {#if personalError}<p class="template-error" role="alert">{personalError} <button type="button" onclick={retryPersonal}>Try again</button></p>{/if}
          {#if personalPreviewLoading}<p role="status">Reading this template…</p>{/if}
          {#if personalPreviewError}<p class="template-error" role="alert">{personalPreviewError}</p>{/if}
          {#if personalNext !== null}<button class="secondary more" type="button" disabled={personalLoading} onclick={() => void loadPersonal(true)}>{personalLoading ? 'Loading…' : 'Load more templates'}</button>{/if}
        </section>

        <section class="current-template" aria-labelledby="current-template"><h3 id="current-template">Current note</h3><p>Adding it uses the <code>template</code> tag. The original stays editable, and its checklists stay out of ToDo.</p>
          <button class="secondary" type="button" disabled={!canToggleCurrent || actionBusy || selectionBusy} onclick={() => toggleCurrent(!currentPersonal)}>
            {#if actionBusy}<LoaderCircle size={15} class="spin"/> Saving…{:else}{currentPersonal ? 'Remove from templates' : 'Add current note to templates'}{/if}
          </button>
          {#if !hasCurrentNote}<small>Open a note to add it to Templates.</small>{:else if !canToggleCurrent}<small>This note is read-only, so its template tag cannot be changed here.</small>{/if}
          {#if actionError}<p class="template-error" role="alert">{actionError}</p>{/if}
        </section>
      </div>

      <section class="template-preview" aria-live="polite" aria-label={`${shownTemplate.name} preview`}>
        <small>Preview</small>
        <div class="rendered-preview">{@html preview.html}</div>
      </section>
    </div>

    <footer><button class="secondary" type="button" onclick={close}>Cancel</button><button class="primary" type="button" disabled={useDisabled} onclick={useTemplate}>{selectionBusy ? 'Preparing…' : 'Use template'}</button></footer>
  </div>
</div>

<style>
  .template-overlay{position:absolute;inset:0;z-index:21;display:grid;place-items:center;padding:20px;background:color-mix(in srgb,var(--ink) 24%,transparent);backdrop-filter:blur(4px)}
  .template-dialog{width:min(760px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 80px #0005;padding:26px;text-align:left}
  header{display:flex;align-items:flex-start;gap:11px;margin-bottom:20px;flex-shrink:0}.template-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--accent) 14%,var(--paper));color:var(--accent);flex-shrink:0}h2{font-size:20px;letter-spacing:-.4px;line-height:1.2;margin:0;font-weight:600}header p{font-size:11px;line-height:1.6;color:var(--soft);margin:4px 0 0}.close{display:grid;place-items:center;margin-left:auto;padding:7px;border:0;background:transparent;color:var(--ink);border-radius:7px}.close:hover{background:var(--wash)}
  .template-content{display:grid;grid-template-columns:minmax(250px,.95fr) minmax(260px,1.05fr);gap:16px;flex:1;min-height:0;overflow:auto}.template-list{display:grid;gap:15px;align-content:start}.template-list section{display:grid;gap:7px}.template-list h3{margin:0;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--soft)}.template-list section>p{margin:0;font-size:10px;line-height:1.5;color:var(--soft)}.template-list button:not(.icon-button){position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:var(--wash);color:var(--ink);text-align:left}.template-list button:not(.icon-button):hover,.template-list button.chosen{border-color:color-mix(in srgb,var(--accent) 65%,var(--line));background:color-mix(in srgb,var(--accent) 10%,var(--wash))}.template-list strong{font-size:12px;font-weight:600}.template-list span{grid-column:1;font-size:10px;line-height:1.45;color:var(--soft)}.template-list :global(svg){grid-column:2;grid-row:1 / span 2;align-self:center;color:var(--accent)}.section-heading{display:flex;align-items:center;justify-content:space-between}.icon-button{display:grid;place-items:center;width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--soft)}.icon-button:hover{background:var(--wash)}.icon-button :global(svg){grid-column:auto;grid-row:auto}.your-templates{padding-top:13px;border-top:1px solid var(--line)}.personal-template:disabled{opacity:.65}.empty{font-style:italic}.template-error{color:var(--danger)!important}.template-error button{border:0;background:transparent;color:inherit;text-decoration:underline;padding:0;font:inherit}.more{justify-content:center!important}.current-template{padding:13px;border:1px solid var(--line);border-radius:9px;background:color-mix(in srgb,var(--accent) 5%,var(--wash))}.current-template code{font:inherit;color:var(--accent)}.current-template small{font-size:10px;color:var(--soft)}
  .template-preview{min-width:0;border:1px solid var(--line);border-radius:9px;background:var(--wash);overflow:hidden}.template-preview small{display:block;padding:9px 12px;border-bottom:1px solid var(--line);font-size:10px;color:var(--soft);letter-spacing:.04em;text-transform:uppercase}.rendered-preview{min-height:100%;max-height:420px;overflow:auto;padding:13px;font-size:11px;line-height:1.65;overflow-wrap:anywhere}.rendered-preview :global(h1),.rendered-preview :global(h2),.rendered-preview :global(h3){margin:0 0 .6em;line-height:1.35}.rendered-preview :global(h1){font-size:1.5em}.rendered-preview :global(h2){font-size:1.2em;margin-top:1.15em}.rendered-preview :global(h3){font-size:1.05em}.rendered-preview :global(p){margin:.45em 0}.rendered-preview :global(ul),.rendered-preview :global(ol){margin:.45em 0;padding-left:20px}.rendered-preview :global(input){accent-color:var(--accent);margin:0 5px 0 0}.rendered-preview :global(input:disabled){opacity:1}.rendered-preview :global(li){margin:.2em 0}
  footer{display:flex;justify-content:flex-end;gap:9px;margin-top:20px;padding-top:18px;border-top:1px solid var(--line);flex-shrink:0}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:10px 13px;font-size:11px;border:1px solid var(--line)}.primary{border-color:transparent;background:var(--accent);color:var(--accent-ink)!important}.secondary{background:var(--wash);color:var(--ink)}
  :is(button):focus-visible{outline:2px solid var(--accent);outline-offset:3px}:global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@container(max-width:620px){.template-overlay{padding:10px}.template-dialog{padding:20px}.template-content{grid-template-columns:1fr;grid-auto-rows:max-content}.rendered-preview{min-height:140px;max-height:220px}.template-preview{order:-1;min-height:180px}}@media(prefers-reduced-motion:reduce){.template-overlay{backdrop-filter:none}:global(.spin){animation:none}}
</style>
