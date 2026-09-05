<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { BookOpen, Plus, Search, Maximize, Minimize, Zap, FileText, PanelLeftClose, PanelLeftOpen, Download, Upload, Trash2, Check, LoaderCircle, Bold, Italic, Heading2, List, Link, Code, Columns2, PenLine, Eye, X, ArrowLeft, RefreshCw } from 'lucide-svelte';
  import type { Host, Library, Note, Document } from './host';
  import { Drafts, NoteSession, MAX_BYTES, type View, type Draft } from './session';
  import { renderMarkdown } from './markdown';
  let { host }: { host: Host } = $props();
  let libraries = $state<Library[]>([]);
  let libraryId = $state('');
  let notes = $state<Note[]>([]);
  let query = $state('');
  let nextOffset = $state<number | null>(null);
  let loading = $state(true);
  let listLoading = $state(false);
  let opening = $state(false);
  let error = $state('');
  let view = $state<View | null>(null);
  let mode = $state<'edit' | 'split' | 'preview'>('edit');
  let sidebar = $state(true);
  let focusMode = $state(false);
  let indexing = $state(false);
  let indexError = $state('');
  let syncing = false;
  let refreshTimer: ReturnType<typeof setInterval>;
  let mobileEditor = $state(false);
  let createOpen = $state(false);
  let createName = $state('');
  let createContent = $state('');
  let createError = $state('');
  let creating = $state(false);
  let deleteOpen = $state(false);
  let deleteName = $state('');
  let reloadOpen = $state(false);
  let deleting = $state(false);
  let recoveries = $state<Array<Draft & { key: string }>>([]);
  let editor = $state<HTMLTextAreaElement>();
  let filePicker = $state<HTMLInputElement>();
  let session: NoteSession | null = null;
  let drafts: Drafts;
  let alive = true;
  let sequence = 0;
  let searchTimer: ReturnType<typeof setTimeout>;
  const ready = $derived(host.documents?.version === 1 && !!host.user);
  const selectedLibrary = $derived(libraries.find(l => l.id === libraryId));
  const html = $derived(renderMarkdown(view?.content ?? ''));
  const wordCount = $derived(view?.content.trim().split(/\s+/).filter(Boolean).length ?? 0);
  const title = (name: string) => name.replace(/\.(?:md|markdown)$/i, '');
  const date = (at: number | null) => at ? new Date(at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const message = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';

  function refreshDrafts() { try { recoveries = drafts.list(); } catch { /* Editing still works with explicit recovery warnings. */ } }
  async function loadList(append = false) {
    if (!host.documents || !libraryId) return;
    const ticket = ++sequence;
    listLoading = true; error = '';
    try {
      const result = await host.documents.list(libraryId, query, append ? (nextOffset ?? 0) : 0);
      if (!alive || ticket !== sequence) return;
      notes = append ? [...notes, ...result.items] : result.items;
      nextOffset = result.nextOffset;
    } catch (e) { if (ticket === sequence) error = message(e); }
    finally { if (ticket === sequence) listLoading = false; }
  }
  async function buildSearch(id: string) {
    if (!id || indexing) return;
    indexing = true; indexError = '';
    let skipped = 0;
    try {
      let more = true;
      while (alive && libraryId === id && more) {
        const result = await host.documents!.index(id, skipped); skipped = result.skipped; more = result.more;
        if (query && alive) await loadList();
      }
      if (skipped) indexError = 'Some notes could not be indexed. Check their storage connection, then refresh.';
    } catch { indexError = 'Search indexing paused. Refresh to try again.'; }
    finally { indexing = false; }
  }
  async function refresh() {
    if (syncing || document.visibilityState !== 'visible' || opening || creating || deleting || createOpen || deleteOpen || reloadOpen) return;
    syncing = true;
    try {
      if (notes.length <= 100) await loadList();
      const current = session;
      const revision = current?.view.document.revision;
      if (current && !current.view.dirty && !current.view.saving) {
        const latest = await host.documents!.read(current.view.document.id);
        if (session === current && current.view.document.revision === revision) current.acceptRemote(latest);
      }
    } catch { /* The last confirmed note stays visible; manual refresh reports errors. */ }
    finally { syncing = false; }
  }
  async function quickCapture() {
    if (!selectedLibrary?.canCreate || opening || creating) return;
    if (!(await ensureSaved())) return;
    opening = true;
    try {
      const name = `Note ${new Date().toISOString().replace(/[:.]/g, '-').slice(0,19)} ${crypto.randomUUID().slice(0,4)}.md`;
      const document = await host.documents!.create({ libraryId, name, content: '' });
      if (!(await ensureSaved())) return;
      session?.abandon(); connect(document); mode = 'edit'; await loadList(); await tick(); editor?.focus();
    } catch (e) { error = message(e); }
    finally { opening = false; }
  }
  async function ensureSaved() {
    const current = session;
    while (current && (current.view.dirty || current.view.saving)) {
      if (!(await current.save())) return false;
    }
    return true;
  }
  async function changeLibrary(id: string) {
    if (opening || creating || deleting) return;
    opening = true;
    try {
      if (!(await ensureSaved())) return;
      session?.abandon(); session = null; view = null; mobileEditor = false;
      libraryId = id; query = ''; notes = []; await loadList(); void buildSearch(id);
    } finally { opening = false; }
  }
  function selectLibrary(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    void changeLibrary(select.value).finally(() => { select.value = libraryId; });
  }
  async function showRecoveries() {
    if (opening || creating || deleting) return;
    opening = true;
    try { if (!(await ensureSaved())) return; session?.abandon(); session = null; view = null; mobileEditor = true; }
    finally { opening = false; }
  }
  function search() { clearTimeout(searchTimer); searchTimer = setTimeout(() => void loadList(), 200); }
  function connect(document: Document) {
    session = new NoteSession(document, host.documents!, drafts, current => { if (alive) view = current; });
    view = { ...session.view }; mobileEditor = true;
  }
  async function open(note: Note) {
    if (opening || !host.documents) return;
    if (!(await ensureSaved())) return;
    opening = true; error = '';
    try {
      const document = await host.documents.read(note.id);
      if (!alive) return;
      if (!(await ensureSaved())) return;
      session?.abandon(); connect(document);
      refreshDrafts();
    } catch (e) { error = message(e); }
    finally { opening = false; }
  }
  async function recover(draft: Draft & { key: string }) {
    if (!(await ensureSaved())) return;
    opening = true;
    try {
      const document = await host.documents!.read(draft.document.id);
      if (!(await ensureSaved())) return;
      session?.abandon(); connect(document); session!.restore(draft);
      // Keep the original recovery record until the user confirms a server save.
      if (!view?.dirty) { drafts.forget(draft.key); refreshDrafts(); }
    } catch (e) { error = message(e) + ' You can still export this recovery copy.'; }
    finally { opening = false; }
  }
  async function save() {
    if (!session) return;
    if (await session.save()) {
      // Remove only recovery copies that match the newly confirmed contents.
      try { for (const d of drafts.list()) if (d.document.id === view?.document.id && d.content === view?.document.content) drafts.forget(d.key); } catch { /* Keep records if browser storage is unavailable. */ }
      refreshDrafts(); await loadList();
    }
  }
  function beginCreate(content = '', name = '') {
    createContent = content; createName = name; createError = ''; createOpen = true;
  }
  async function create() {
    if (!host.documents || creating) return;
    const name = /\.(md|markdown)$/i.test(createName.trim()) ? createName.trim() : `${createName.trim()}.md`;
    if (!createName.trim()) { createError = 'Give your note a name.'; return; }
    creating = true; createError = '';
    try {
      const document = await host.documents.create({ libraryId, name, content: createContent });
      if (session?.view.conflict && createContent === session.view.content) {
        session.abandon(); drafts.remove(session.view.document.id); session = null;
      }
      if (session?.view.dirty && !(await session.save())) {
        createError = 'The new note was saved. Resolve the open draft before switching notes.'; await loadList(); return;
      }
      if (!(await ensureSaved())) return;
      session?.abandon(); connect(document); createOpen = false; await loadList();
      await tick(); editor?.focus();
    } catch (e) { createError = message(e); }
    finally { creating = false; }
  }
  async function importFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES || !/\.(md|markdown)$/i.test(file.name)) { error = 'Choose a Markdown file up to 1 MB.'; return; }
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (content.includes('\0')) throw new Error('Choose a UTF-8 Markdown text file.');
      beginCreate(content, file.name);
    } catch (e) { error = message(e); }
  }
  function download(content: string, name: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function remove() {
    if (!view || !host.documents || deleteName !== title(view.document.name)) return;
    deleting = true; error = '';
    try {
      if (session && !(await session.save())) { deleteOpen = false; return; }
      const id = view.document.id;
      await host.documents.delete(id, view.document.revision);
      session?.abandon(); session = null; view = null; mobileEditor = false;
      drafts.remove(id); deleteOpen = false; refreshDrafts(); await loadList();
    } catch (e) { error = message(e); deleteOpen = false; }
    finally { deleting = false; }
  }
  async function reload() {
    if (!view) return;
    try {
      const document = await host.documents!.read(view.document.id);
      // Export is offered before explicit replacement. Do not flush the discarded draft.
      session?.abandon(); drafts.remove(view.document.id); connect(document); reloadOpen = false; refreshDrafts();
    } catch (e) { error = message(e); reloadOpen = false; }
  }
  function format(before: string, after = '', prefix = false) {
    if (!view || !editor) return;
    if (opening || creating || deleting) return;
    const start = prefix ? view.content.lastIndexOf('\n', editor.selectionStart - 1) + 1 : editor.selectionStart;
    const end = prefix ? start : editor.selectionEnd;
    const selection = view.content.slice(start, end);
    session?.edit(view.content.slice(0, start) + before + selection + after + view.content.slice(end));
    void tick().then(() => { editor?.focus(); editor?.setSelectionRange(start + before.length, end + before.length); });
  }
  function shortcuts(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 'n' && event.shiftKey) { event.preventDefault(); void quickCapture(); }
    if (event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
    if (event.target !== editor) return;
    if (event.key.toLowerCase() === 'b') { event.preventDefault(); format('**', '**'); }
    if (event.key.toLowerCase() === 'i') { event.preventDefault(); format('*', '*'); }
  }
  function leave(event: BeforeUnloadEvent) { if (view?.dirty) { event.preventDefault(); event.returnValue = ''; } }
  function focusDialog(node: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    queueMicrotask(() => (node.querySelector('input') ?? node.querySelector('button'))?.focus());
    const trap = (e: KeyboardEvent) => {
      if(e.key !== 'Tab') return;
      const controls = [...node.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')];
      const first = controls[0], last = controls.at(-1);
      if(e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if(!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    node.addEventListener('keydown', trap);
    return { destroy(){ node.removeEventListener('keydown', trap); previous?.focus(); } };
  }
  function modalKey(event: KeyboardEvent) { if (event.key === 'Escape' && !creating && !deleting) { createOpen = false; deleteOpen = false; reloadOpen = false; } }
  function previewClick(event: MouseEvent) {
    const a = (event.target as Element).closest('a');
    if (a) { event.preventDefault(); if (/^(https:\/\/|mailto:)/i.test(a.href)) window.open(a.href, '_blank', 'noopener,noreferrer'); }
  }
  export async function flush() { await session?.dispose(); }
  onMount(() => {
    if (!ready) { loading = false; return; }
    const client = crypto.randomUUID();
    let storage: Storage;
    try { storage = localStorage; } catch { storage = { get length(){return 0;}, clear(){}, key(){return null;}, getItem(){return null;}, removeItem(){}, setItem(){throw new Error('Recovery storage unavailable');} }; }
    drafts = new Drafts(storage, host.user!.id, client);
    refreshDrafts();
    void (async () => {
      try { libraries = await host.documents!.libraries(); libraryId = libraries[0]?.id ?? ''; await loadList(); }
      catch (e) { error = message(e); }
      finally { loading = false; void buildSearch(libraryId); }
    })();
    refreshTimer = setInterval(() => void refresh(), 3000);
    window.addEventListener('beforeunload', leave);
  });
  onDestroy(() => { alive = false; clearInterval(refreshTimer); clearTimeout(searchTimer); session?.abandon(); window.removeEventListener('beforeunload', leave); });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- Keyboard shortcuts belong to this extension's focused panel. -->
<div class="notes-app" class:sidebar-hidden={!sidebar || focusMode} class:focus-mode={focusMode} class:mobile-editor={mobileEditor || (!loading && ready && !libraries.length)} onkeydown={shortcuts} role="region" aria-label="TEND Notes" tabindex="-1">
  {#if !ready}
    <div class="welcome"><BookOpen size={44}/><h1>TEND Notes</h1><p>Update Tend to use your new notes space.</p><p class="muted">This extension needs Tend’s Documents editing support.</p></div>
  {:else if loading}
    <div class="welcome" role="status"><LoaderCircle class="spin"/><p>Opening your notebooks…</p></div>
  {:else}
    <aside>
      <div class="brand"><span class="brand-icon"><BookOpen size={20}/></span><div><strong>TEND Notes</strong><small>A little space to think.</small></div></div>
      <div class="library-picker"><label for="notes-library">NOTEBOOK</label><select id="notes-library" value={libraryId} onchange={selectLibrary} disabled={!libraries.length || opening}>{#each libraries as library}<option value={library.id}>{library.name}</option>{/each}</select></div>
      <button class="primary new-note" onclick={() => beginCreate()} disabled={!selectedLibrary?.canCreate}><Plus size={17}/> New note <kbd aria-hidden="true">+</kbd></button>
      <button class="quiet quick-capture" onclick={() => void quickCapture()} disabled={!selectedLibrary?.canCreate || opening} title="Quick capture (Ctrl+Shift+N)"><Zap size={13}/> Quick capture</button>
      {#if !selectedLibrary?.canCreate}<a class="quiet setup-link" href="#/shell/files">Connect a notebook folder in Files</a>{/if}
      {#if recoveries.length}<button class="quiet recovery-link" onclick={() => void showRecoveries()}>Recovery copies ({recoveries.length})</button>{/if}
      <label class="search"><Search size={15}/><input aria-label="Search your notes" placeholder="Search your notes" bind:value={query} oninput={search}/></label>
      <div class="list-heading"><span>YOUR NOTES</span><button class="icon" aria-label="Refresh notes" title="Refresh notes" onclick={() => { void loadList(); void buildSearch(libraryId); }} disabled={listLoading}><RefreshCw size={13} class={listLoading ? 'spin' : ''}/></button></div>
      <div class="note-list" aria-label="Notes">
        {#each notes as note (note.id)}
          <button class="note" class:selected={view?.document.id === note.id} onclick={() => void open(note)} disabled={opening} aria-pressed={view?.document.id === note.id}><FileText size={17}/><span><strong>{title(note.name)}</strong><small>{date(note.modifiedAt)} · Markdown</small></span></button>
        {:else}
          <div class="list-empty"><FileText size={22}/><p>{query ? 'No matching notes.' : 'Your next idea starts here.'}</p></div>
        {/each}
        {#if nextOffset !== null}<button class="quiet more" onclick={() => void loadList(true)} disabled={listLoading}>Load more notes</button>{/if}
      </div>
      <div class="sidebar-footer">{#if indexing}<small role="status">Preparing full-text search…</small>{/if}{#if indexError}<small role="status">{indexError}</small>{/if}<button class="quiet" onclick={() => filePicker?.click()} disabled={!selectedLibrary?.canCreate}><Upload size={14}/> Import Markdown</button><small>Yours to keep. Plain Markdown.</small></div>
    </aside>
    <main>
      <header><button class="icon desktop-toggle" onclick={() => sidebar = !sidebar} aria-label={sidebar ? 'Hide notebooks' : 'Show notebooks'} title={sidebar ? 'Hide notebooks' : 'Show notebooks'}>{#if sidebar}<PanelLeftClose size={18}/>{:else}<PanelLeftOpen size={18}/>{/if}</button><button class="icon mobile-back" onclick={() => mobileEditor = false} aria-label="Back to notes"><ArrowLeft size={18}/></button><span class="breadcrumb">{selectedLibrary?.name ?? 'Your notes'}{#if view}<span class="slash">/</span><span>{title(view.document.name)}</span>{/if}</span>{#if view}<button class="icon focus-toggle" aria-label={focusMode ? "Exit focus mode" : "Focus mode"} title={focusMode ? "Exit focus mode" : "Focus mode"} onclick={() => { focusMode = !focusMode; mode = "edit"; }}>{#if focusMode}<Minimize size={16}/>{:else}<Maximize size={16}/>{/if}</button><div class="view-modes" aria-label="Editor view"><button class:active={mode === 'edit'} class="icon" aria-label="Edit Markdown" title="Edit Markdown" onclick={() => mode = 'edit'}><PenLine size={16}/></button><button class:active={mode === 'split'} class="icon split-button" aria-label="Split view" title="Split view" onclick={() => mode = 'split'}><Columns2 size={16}/></button><button class:active={mode === 'preview'} class="icon" aria-label="Preview" title="Preview" onclick={() => mode = 'preview'}><Eye size={17}/></button></div>{/if}</header>
      {#if error}<div class="notice error" role="alert">{error}<button class="icon" aria-label="Dismiss message" onclick={() => error = ''}><X size={15}/></button></div>{/if}
      {#if recoveries.length && !view}
        <div class="recovery"><strong>Pick up an unsaved draft</strong><p>Recovery copies from this browser are ready when you are.</p>{#each recoveries as draft}<div><button class="quiet" onclick={() => void recover(draft)} disabled={opening}>{title(draft.document.name)}</button><button class="icon" aria-label={`Export recovery copy of ${draft.document.name}`} onclick={() => download(draft.content, draft.document.name)}><Download size={15}/></button></div>{/each}</div>
      {/if}
      {#if view}
        <div class="document-heading"><div><span class="eyebrow">A PAGE FOR YOUR THOUGHTS</span><h1>{title(view.document.name)}</h1></div><div class="document-actions"><button class="icon" aria-label="Export Markdown" title="Export Markdown" onclick={() => download(view!.content, view!.document.name)}><Download size={17}/></button><button class="icon" aria-label="Delete note" title="Delete note" onclick={() => { deleteName = ''; deleteOpen = true; }}><Trash2 size={16}/></button></div></div>
        {#if view.error || view.recoveryError}<div class="notice error" role="alert"><div>{view.error || view.recoveryError}<div class="notice-actions">{#if view.conflict}<button class="quiet" onclick={() => reloadOpen = true}>Reload saved version</button><button class="quiet" onclick={() => beginCreate(view!.content, `${title(view!.document.name)} copy`)}>Save as new note</button>{:else}<button class="quiet" onclick={() => void save()}>Retry save</button>{/if}<button class="quiet" onclick={() => download(view!.content, view!.document.name)}>Export draft</button></div></div></div>{/if}
        {#if mode !== 'preview'}<div class="formatting" aria-label="Markdown formatting"><button class="icon" title="Bold (Ctrl+B)" aria-label="Bold" onclick={() => format('**', '**')}><Bold size={16}/></button><button class="icon" title="Italic (Ctrl+I)" aria-label="Italic" onclick={() => format('*', '*')}><Italic size={16}/></button><span></span><button class="icon" title="Heading" aria-label="Heading" onclick={() => format('## ', '', true)}><Heading2 size={18}/></button><button class="icon" title="Bullet list" aria-label="Bullet list" onclick={() => format('- ', '', true)}><List size={17}/></button><button class="icon" title="Link" aria-label="Insert link" onclick={() => format('[', '](https://)')}><Link size={16}/></button><button class="icon" title="Code" aria-label="Inline code" onclick={() => format('`', '`')}><Code size={17}/></button><small>Markdown</small></div>{/if}
        <div class="writing" class:split={mode === 'split'} class:preview-only={mode === 'preview'}>
          {#if mode !== 'preview'}<textarea class="editor" bind:this={editor} aria-label="Note Markdown" readonly={opening || creating || deleting} value={view.content} oninput={e => session?.edit(e.currentTarget.value)} placeholder="Start with a thought…" spellcheck="true"></textarea>{/if}
          {#if mode !== 'edit'}<!-- svelte-ignore a11y_click_events_have_key_events --><!-- svelte-ignore a11y_no_static_element_interactions --><div class="preview" onclick={previewClick}>{@html html}</div>{/if}
        </div>
        <footer><span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span><button class="save-status" onclick={() => void save()} disabled={view.saving || !view.dirty || view.conflict}>{#if view.saving}<LoaderCircle size={13} class="spin"/> Saving…{:else if view.dirty}<span class="unsaved-dot"></span>{view.error ? 'Not saved' : 'Save now'}{:else}<Check size={14}/> All changes saved{/if}</button></footer>
      {:else}
        <div class="welcome"><span class="welcome-icon"><BookOpen size={37} strokeWidth={1.4}/></span><span class="eyebrow">YOUR OWN QUIET CORNER</span><h1>Make room for an idea.</h1>{#if !libraries.length}<p>Create a Documents library in Tend’s Files panel and connect a server folder to start your notebook.</p><a class="primary" href="#/shell/files">Open Files</a>{:else if !selectedLibrary?.canCreate}<p>Connect one server folder to this Documents library in Files to start creating notes.</p><a class="primary" href="#/shell/files">Open Files</a>{:else}<p>A quick thought. A plan taking shape. Something worth remembering.<br/>Keep it here, in your own words.</p><button class="primary" onclick={() => beginCreate()}><Plus size={17}/> Write your first note</button><button class="quiet" onclick={() => filePicker?.click()}><Upload size={14}/> Bring a Markdown file</button>{/if}<small>Simple to write. Easy to take with you.</small></div>
      {/if}
    </main>
    <input class="hidden" bind:this={filePicker} type="file" accept=".md,.markdown,text/markdown" onchange={importFile}/>
  {/if}
  {#if createOpen || deleteOpen || reloadOpen}
    <div class="notes-dialog-layer" role="presentation"><div class="notes-dialog" use:focusDialog role="dialog" aria-modal="true" aria-label={createOpen ? 'New note' : deleteOpen ? 'Delete note' : 'Reload saved version'} tabindex="-1" onkeydown={modalKey}>
      <button class="icon close" aria-label="Close dialog" onclick={() => { createOpen = false; deleteOpen = false; reloadOpen = false; }} disabled={creating || deleting}><X size={18}/></button>
      {#if createOpen}<BookOpen size={26}/><h2>A fresh page.</h2><p>Give your note a name. You can start writing right away.</p><form onsubmit={e => { e.preventDefault(); void create(); }}><label for="new-note-name">Note name</label><input id="new-note-name" bind:value={createName} placeholder="An idea worth keeping" maxlength="220" required disabled={creating}/><small>Saved as a Markdown file in {selectedLibrary?.name}.</small>{#if createError}<p class="form-error" role="alert">{createError}</p>{/if}<button class="primary" type="submit" disabled={creating}>{#if creating}<LoaderCircle size={16} class="spin"/> Creating…{:else}<Plus size={16}/> Create note{/if}</button></form>
      {:else if deleteOpen}<Trash2 size={26}/><h2>Delete this note?</h2><p>“{view ? title(view.document.name) : ''}” will be permanently deleted from its storage folder. This cannot be undone.</p><label for="delete-note-name">Type the note name to delete it</label><input id="delete-note-name" bind:value={deleteName} autocomplete="off" disabled={deleting}/><button class="danger" onclick={() => void remove()} disabled={deleting || deleteName !== (view ? title(view.document.name) : "")}>{deleting ? 'Deleting…' : 'Delete note'}</button>
      {:else}<RefreshCw size={26}/><h2>Replace this draft?</h2><p>Your current unsaved edits will be replaced by the saved version. Export a copy first if you want to keep them.</p><button class="quiet" onclick={() => download(view!.content, view!.document.name)}>Export draft</button><button class="danger" onclick={() => void reload()}>Reload saved version</button>{/if}
    </div></div>
  {/if}
</div>

<style>
  .notes-app{--paper:var(--color-base-100,#151b19);--ink:var(--color-base-content,#d8e3df);--wash:var(--color-base-200,#1d2622);--line:color-mix(in srgb,var(--ink) 10%,transparent);--soft:color-mix(in srgb,var(--ink) 54%,transparent);--accent:var(--color-primary,#66b798);--accent-ink:var(--color-primary-content,#071a13);--warning:var(--color-warning,#d7ac64);--danger:var(--color-error,#dc7777);--danger-ink:var(--color-error-content,#250c0c);height:100%;min-height:360px;display:grid;grid-template-columns:254px minmax(0,1fr);color:var(--ink);background:var(--paper);font:14px/1.5 var(--font-sans,system-ui,sans-serif);position:relative;container-type:inline-size;overflow:hidden;text-align:left}
  .notes-app :global(*){box-sizing:border-box}.notes-app :global(button),.notes-app :global(input),.notes-app :global(select),.notes-app :global(textarea){font:inherit}.notes-app :global(button){cursor:pointer}.notes-app :global(button:disabled){opacity:.45;cursor:default}.notes-app :global(button:focus-visible),.notes-app :global(input:focus-visible),.notes-app :global(select:focus-visible),.notes-app :global(a:focus-visible){outline:2px solid var(--accent);outline-offset:3px}.notes-app :global(button){color:inherit}.notes-app :global(h1),.notes-app :global(h2),.notes-app :global(p){margin:0}
  aside{background:color-mix(in srgb,var(--wash) 70%,var(--paper));border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;padding:28px 16px 18px}.brand{display:flex;align-items:center;gap:11px;margin:0 8px 28px}.brand-icon{display:grid;place-items:center;width:38px;height:42px;border-radius:12px;background:var(--accent);color:var(--accent-ink)}.brand strong{display:block;font-size:16px;letter-spacing:-.4px}.brand small{display:block;color:var(--soft);font-size:10px;margin-top:2px}.library-picker{padding:0 8px;margin-bottom:16px}.library-picker label,.list-heading{font-size:10px;font-weight:600;letter-spacing:1.3px;color:var(--soft)}select{width:100%;border:0;background:transparent;color:var(--ink);margin-top:5px;padding:2px 0}.primary,.danger{display:inline-flex;justify-content:center;align-items:center;gap:9px;border:0;border-radius:9px;background:var(--accent);color:var(--accent-ink)!important;padding:10px 16px;font-weight:550;text-decoration:none;font-size:13px;box-shadow:0 2px 3px #00000008}.new-note{width:100%;justify-content:flex-start}kbd{margin-left:auto;font:13px system-ui;opacity:.6}.search{display:flex;align-items:center;gap:9px;color:var(--soft);padding:10px 8px;margin-top:14px}.search input{background:none;border:0;outline:0!important;width:100%;font-size:12px;color:var(--ink)}.search input::placeholder{color:var(--soft)}.list-heading{display:flex;align-items:center;justify-content:space-between;margin:17px 8px 8px}.note-list{overflow:auto;flex:1}.note{display:flex;align-items:center;gap:10px;padding:12px;width:100%;border:1px solid transparent;background:none;border-radius:9px;text-align:left;margin-bottom:4px}.note>span{min-width:0}.note strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:550}.note small{display:block;font-size:10px;color:var(--soft);margin-top:3px}.note> :global(svg){flex-shrink:0;color:var(--soft)}.note.selected{background:var(--paper);border-color:var(--line);box-shadow:0 2px 6px #00000004}.note.selected> :global(svg){color:var(--accent)}.note:hover{background:color-mix(in srgb,var(--paper) 70%,transparent)}.sidebar-footer{padding-top:18px;border-top:1px solid var(--line);margin-top:20px}.sidebar-footer>small{font-size:10px;color:var(--soft);display:block;padding-left:8px;margin-top:8px}.quiet{display:inline-flex;gap:8px;align-items:center;border:0;background:transparent;padding:7px 8px;border-radius:6px;font-size:12px}.quiet:hover,.icon:hover{background:color-mix(in srgb,var(--ink) 6%,transparent)}.list-empty{padding:25px 12px;color:var(--soft);font-size:11px;text-align:center}.list-empty :global(svg){margin:auto auto 10px}.more{width:100%;justify-content:center}.hidden{display:none}
  main{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}header{height:60px;display:flex;align-items:center;gap:14px;padding:0 24px;border-bottom:1px solid var(--line);flex-shrink:0}.icon{width:30px;height:30px;border:0;display:inline-flex;align-items:center;justify-content:center;background:none;border-radius:6px;flex-shrink:0}.breadcrumb{font-size:11px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.slash{padding:0 12px;opacity:.5}.view-modes{display:flex;gap:2px;margin-left:auto;padding:3px;background:var(--wash);border-radius:8px}.view-modes .active{background:var(--paper);box-shadow:0 1px 3px #0000000a}.welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:35px 28px;gap:17px;overflow:auto}.welcome-icon{width:76px;height:82px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--accent) 8%,var(--paper));color:var(--accent);margin-bottom:10px;transform:rotate(-5deg)}.welcome h1{font-size:clamp(24px,3cqw,34px);font-weight:500;letter-spacing:-1px}.welcome p{max-width:420px;font-size:13px;line-height:1.85;color:var(--soft)}.welcome>small{font-size:10px;color:var(--soft);margin-top:20px}.welcome .quiet{margin-top:-10px;color:var(--soft)}.eyebrow{font-size:9px;letter-spacing:1.8px;font-weight:600;color:var(--soft)}.welcome .primary{margin-top:8px}.document-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:36px 42px 22px}.document-heading h1{font-size:28px;line-height:1.3;letter-spacing:-.7px;font-weight:550;margin-top:9px;overflow-wrap:anywhere}.document-actions{display:flex;gap:4px;color:var(--soft)}.formatting{display:flex;align-items:center;gap:4px;padding:0 36px 13px;border-bottom:1px solid var(--line);color:var(--soft)}.formatting>span{width:1px;height:16px;background:var(--line);margin:0 6px}.formatting small{font-size:10px;margin-left:auto}.writing{flex:1;min-height:120px;display:flex;overflow:hidden}.editor{display:block;resize:none;border:0;outline:none;flex:1;width:100%;min-width:0;padding:28px 42px;line-height:1.9!important;font-size:14px!important;background:transparent;color:var(--ink);tab-size:2}.editor::placeholder{color:color-mix(in srgb,var(--ink) 30%,transparent)}.preview{padding:28px 42px;overflow:auto;flex:1;min-width:0;overflow-wrap:anywhere;line-height:1.85}.split .editor,.split .preview{width:50%;padding:24px}.split .preview{border-left:1px solid var(--line)}.preview :global(h1),.preview :global(h2),.preview :global(h3){margin:1em 0 .6em;line-height:1.4}.preview :global(p){margin:0 0 1em}.preview :global(a){color:var(--accent);text-decoration:underline}.preview :global(pre){overflow:auto;background:var(--wash);padding:16px;border-radius:8px}.preview :global(blockquote){border-left:3px solid var(--accent);margin:1em 0;padding-left:18px;color:var(--soft)}.preview :global(table){border-collapse:collapse;width:100%;font-size:12px}.preview :global(th),.preview :global(td){border:1px solid var(--line);padding:8px}.preview :global(ul),.preview :global(ol){padding-left:22px}.preview :global(input){pointer-events:none}footer{height:41px;border-top:1px solid var(--line);padding:0 28px;display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--soft);flex-shrink:0}.save-status{border:0;background:none;display:flex;align-items:center;gap:6px;font-size:10px}.save-status:disabled{opacity:1!important}.unsaved-dot{width:5px;height:5px;border-radius:50%;background:var(--warning)}.notice{margin:12px 24px 0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--danger) 24%,transparent);border-radius:8px;display:flex;justify-content:space-between;font-size:12px;background:color-mix(in srgb,var(--danger) 5%,var(--paper))}.notice-actions{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}.recovery{margin:18px 24px;padding:16px;background:var(--wash);border-radius:10px;font-size:12px}.recovery p{color:var(--soft);font-size:11px;margin:3px 0 9px}.recovery>div{display:flex;align-items:center;justify-content:space-between}.sidebar-hidden{grid-template-columns:minmax(0,1fr)}.sidebar-hidden aside{display:none}.mobile-back{display:none}
  .notes-dialog-layer{position:absolute;inset:0;z-index:10;background:color-mix(in srgb,var(--paper) 60%,transparent);backdrop-filter:blur(3px);display:grid;place-items:center;padding:20px}.notes-dialog{position:relative;background:var(--paper);padding:32px;border-radius:16px;box-shadow:0 20px 80px #0003;width:min(400px,100%);max-height:100%;overflow:auto}.notes-dialog>.close{position:absolute;right:15px;top:15px}.notes-dialog> :global(svg){color:var(--accent)}.notes-dialog h2{font-size:23px;font-weight:500;letter-spacing:-.5px;margin:18px 0 10px}.notes-dialog p{font-size:12px;color:var(--soft);margin-bottom:22px}.notes-dialog form>label{display:block;font-size:12px;font-weight:550;margin:15px 0 8px}.notes-dialog input{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:8px;color:var(--ink);background:var(--wash)}.notes-dialog form>small{display:block;color:var(--soft);font-size:10px;margin:8px 0 22px}.notes-dialog .primary{width:100%}.notes-dialog .form-error{color:var(--danger);margin:12px 0}.danger{background:var(--danger);color:var(--danger-ink)!important;margin-top:10px}.notes-app :global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
  @container(max-width:680px){aside{padding:20px 14px}.desktop-toggle{display:none}.mobile-back{display:inline-flex}.document-heading{padding:26px 22px 18px}.document-heading h1{font-size:23px}.formatting{padding:0 16px 10px}.editor,.preview{padding:22px}.split-button{display:none}.split .preview{display:none}.split .editor{width:100%}header{padding:0 16px;gap:8px}.breadcrumb{max-width:40cqw}.welcome p br{display:none}.welcome{padding:26px 18px}.document-actions{gap:0}.notes-dialog{padding:26px}.notes-dialog-layer{padding:14px}.notice{margin:10px 14px 0}}
  .focus-toggle{margin-left:auto}.focus-toggle+.view-modes{margin-left:0}.focus-mode .document-heading,.focus-mode .formatting,.focus-mode .breadcrumb,.focus-mode .view-modes,.focus-mode .desktop-toggle{display:none}.focus-mode .editor{max-width:820px;margin:auto;height:100%;padding-top:55px}.focus-mode header{border-bottom-color:transparent}.setup-link,.recovery-link{font-size:11px;color:var(--accent);margin-top:8px;text-decoration:none}.quick-capture{font-size:11px;margin:7px 0 -8px}
  @media(prefers-reduced-motion:reduce){.notes-app :global(.spin){animation:none}}

  /* The container cannot query itself: choose its columns with a tiny observer. */
  .notes-app:global(.narrow){grid-template-columns:minmax(0,1fr)}.notes-app:global(.narrow):not(.mobile-editor) main{display:none}.notes-app:global(.narrow).mobile-editor aside{display:none}.notes-app:global(.narrow) aside{display:flex}.notes-app:global(.narrow).mobile-editor main{display:flex}
</style>
