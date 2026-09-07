<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { LayoutTemplate, BookOpen, Plus, Search, Pin, Tag, Maximize, Minimize, Zap, FileText, PanelLeftClose, PanelLeftOpen, Download, Upload, Trash2, Check, LoaderCircle, Bold, Italic, Heading2, List, Link, Code, Columns2, FolderOpen, PenLine, Eye, X, ArrowLeft, RefreshCw, FilePlus2, BookPlus, Palette, TextCursorInput, Strikethrough, ListOrdered, ListTodo, Quote, SquareCode, Table2, Minus, ImagePlus, Mic, Youtube, CalendarDays, ArrowDownWideNarrow } from 'lucide-svelte';
  import type { Host, Library, Note, Document, Documents } from './host';
  import { Drafts, NoteSession, MAX_BYTES, type View, type Draft } from './session';
  import Preview from './Preview.svelte';
  import TemplatePicker from './TemplatePicker.svelte';
  import TodoPanel from './TodoPanel.svelte';
  import TrashPanel from './TrashPanel.svelte';
  import { TaskWorkspace, type TaskState } from './taskWorkspace';
  import { WorkerTaskProcessor } from './taskProcessor';
  import type { NoteTemplate } from './templates';
  import { isPersonalTemplate, listPersonalTemplates, markPersonalTemplate, readPersonalTemplate } from './personalTemplates';
  import { dailyNote } from './daily';
  import MediaDialog from './MediaDialog.svelte';
  import { editMarkdown } from './formatting';
  import { markdownNewline, type MarkdownNewline } from './keyboard';
  import BackupPanel from './BackupPanel.svelte';
  import { unpack, withBody, withOrganization, normalizeTag, COLORS, type Organization } from './organization';
  let { host }: { host: Host } = $props();
  let libraries = $state<Library[]>([]);
  let libraryId = $state('');
  let notes = $state<Note[]>([]);
  let query = $state('');
  let searchOpen = $state(false);
  let searchInput = $state<HTMLInputElement>();
  let searchTrigger = $state<HTMLButtonElement>();
  let filterTools = $state<HTMLDivElement>();
  let sidebarPopover = $state<'color' | 'sort' | 'tags' | null>(null);
  let filterTrigger: HTMLButtonElement | null = null;
  async function toggleSearch() {
    sidebarPopover = null;
    searchOpen = !searchOpen;
    if (!searchOpen && query) { query = ''; clearTimeout(searchTimer); void loadList(); }
    await tick();
    (searchOpen ? searchInput : searchTrigger)?.focus();
  }
  function closeFilter(restoreFocus = false) {
    sidebarPopover = null;
    if (restoreFocus) filterTrigger?.focus();
  }
  async function toggleFilter(kind: 'color' | 'sort' | 'tags', event: MouseEvent) {
    filterTrigger = event.currentTarget as HTMLButtonElement;
    sidebarPopover = sidebarPopover === kind ? null : kind;
    await tick();
    (filterTools?.querySelector<HTMLButtonElement>('.filter-popover button[aria-pressed="true"]') ?? filterTools?.querySelector<HTMLButtonElement>('.filter-popover button'))?.focus();
  }
  function dismissFilter(node: HTMLElement) {
    const boundary = filterTools ?? node;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !filterTools?.contains(event.target)) closeFilter();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeFilter(true); }
    };
    const blur = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && !boundary.contains(event.relatedTarget)) closeFilter();
    };
    document.addEventListener('pointerdown', outside);
    boundary.addEventListener('keydown', key);
    boundary.addEventListener('focusout', blur);
    return { destroy() { document.removeEventListener('pointerdown', outside); boundary.removeEventListener('keydown', key); boundary.removeEventListener('focusout', blur); } };
  }
  const colorLabel = (color: string) => color === 'none' ? 'No color' : color ? color[0].toUpperCase() + color.slice(1) : 'All colors';
  let tagFilter = $state('');
  let colorFilter = $state('');
  let pinnedFilter = $state(false);
  let noteSort = $state<'recent' | 'title'>('recent');
  let facets = $state({ total: 0, pinned: 0, tags: [] as Array<{name: string; count: number}> });
  let organizeOpen = $state(false);
  let tagInput = $state('');
  let backupOpen = $state(false);
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
  let templateTrigger: HTMLElement | null = null;
  let todayOpening = $state(false);
  let templatesOpen = $state(false);
  // This is a capability reference, not reactive document data. `$state.raw`
  // rerenders on replacement while preserving the capability's identity.
  let templateOpenDocuments = $state.raw<Documents | null>(null);
  let templateOpenAccount = $state<string | undefined>(undefined);
  let templateOpenLibrary = $state('');
  let templateSelection = 0;
  let templateSelectionBusy = $state(false);
  let templateActionBusy = $state(false);
  let templateActionError = $state('');
  let templateRefresh = $state(0);
  let todoOpen = $state(false);
  let trashOpen = $state(false);
  let trashTrigger: HTMLElement | null = null;
  let deleteRequest = $state<{documentId: string; revision: string; operationId: string} | null>(null);
  let deletePending = $state(false);
  async function openTrash() {
    if (!host.documents?.trash || !(await ensureSaved())) return;
    trashTrigger = document.activeElement as HTMLElement | null;
    taskWorkspace?.cancel(); todoOpen = false; trashOpen = true; mobileEditor = true;
  }
  async function closeTrash() {
    trashOpen = false; mobileEditor = !!view;
    await loadList(); await tick(); trashTrigger?.focus();
  }
  let todoState = $state<TaskState>({rows: [], loading: false, scanned: 0, errors: [], busy: false});
  let taskWorkspace: TaskWorkspace | null = null;
  let todoTrigger: HTMLElement | null = null;
  let todoPreviousMobile = false;
  let createTemplate = $state('');
  let createOpen = $state(false);
  let createName = $state('');
  let createContent = $state('');
  let createError = $state('');
  let creating = $state(false);
  let deleteOpen = $state(false);
  let actionNote = $state<Note | null>(null);
  let colorNote = $state('');
  let renameOpen = $state<'note' | 'notebook' | null>(null);
  let renameName = $state('');
  let actionBusy = $state(false);
  let actionError = $state('');
  let quickCapturedId = $state('');
  let mediaKind = $state<'image' | 'youtube' | 'audio' | null>(null);
  let mediaTarget = $state<{id: string; start: number; end: number; content: string} | null>(null);

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
  const trashSupported = $derived(host.documents?.trash?.version === 1);
  const deletionUncertain = $derived(deletePending && deleteRequest?.documentId === view?.document.id);
  const selectedLibrary = $derived(libraries.find(l => l.id === libraryId));
  const parsed = $derived(unpack(view?.content ?? ''));
  const hasLoadedNotes = $derived(notes.length > 0);
  const quickCaptureTitle = $derived(quickCapturedId === view?.document.id ? suggestedTitle(parsed.body) : '');

  const wordCount = $derived(parsed.body.trim().split(/\s+/).filter(Boolean).length);
  const title = (name: string) => name.replace(/\.(?:md|markdown)$/i, '');
  const date = (at: number | null) => at ? new Date(at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const message = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
  function suggestedTitle(content: string) {
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
    const plain = firstLine
      .replace(/^(?:#{1,6}\s+|>\s*|(?:[-+*]\s+)?\[[ xX]\]\s+|[-+*]\s+|\d+[.)]\s+)/, '')
      .replace(/\s+/g, ' ')
      .trim();
    return plain && plain.length <= 220 ? plain : '';
  }

  function refreshDrafts() { try { recoveries = drafts.list(); } catch { /* Editing still works with explicit recovery warnings. */ } }
  async function loadList(append = false) {
    if (!host.documents || !libraryId) return;
    const ticket = ++sequence;
    listLoading = true;
    try {
      const result = await host.documents.list(libraryId, query, append ? (nextOffset ?? 0) : 0, { tag: tagFilter, color: colorFilter, pinned: pinnedFilter, sort: noteSort });
      if (!alive || ticket !== sequence) return;
      notes = append ? [...notes, ...result.items] : result.items;
      nextOffset = result.nextOffset;
      if (result.facets) facets = result.facets;
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
    finally { indexing = false; if (alive && libraryId && libraryId !== id) void buildSearch(libraryId); }
  }
  async function refresh() {
    if (trashOpen || todoOpen || syncing || document.visibilityState !== 'visible' || opening || creating || deleting || templatesOpen || createOpen || deleteOpen || reloadOpen || renameOpen || actionBusy || mediaKind) return;
    syncing = true;
    try {
      if (notes.length <= 100) await loadList();
      const current = session;
      const revision = current?.view.document.revision;
      if (current && !current.view.dirty && !current.view.saving) {
        const latest = await host.documents!.read(current.view.document.id);
        if (!mediaKind && !actionBusy && session === current && current.view.document.revision === revision) current.acceptRemote(latest);
      }
    } catch { /* The last confirmed note stays visible; manual refresh reports errors. */ }
    finally { syncing = false; }
  }
  async function setupNotebook() {
    if (opening) return;
    if (!host.documents?.setupLibrary) { error = 'Update Tend to set up a notebook directly in Notes.'; return; }
    opening = true; error = '';
    try {
      if (!(await ensureSaved())) return;
      const selected = await host.documents.setupLibrary();
      if (!alive || !selected) return;
      // Setup may stay open while the current save completes. Recheck before switching.
      if (!(await ensureSaved())) return;
      libraries = await host.documents.libraries();
      session?.abandon(); session = null; view = null;
      libraryId = selected.id; query = ''; tagFilter = ''; colorFilter = ''; pinnedFilter = false;
      await loadList(); void buildSearch(libraryId);
    } catch(e) { if(alive) error = message(e); }
    finally { opening = false; }
  }
  async function findDaily(documents: NonNullable<Host['documents']>, library: string, name: string, current: () => boolean) {
    // Search is advisory presentation state. This exact, bounded lookup never
    // inherits the sidebar's query, tag, color, pin, or sort filters.
    let offset = 0;
    for (let pages = 0; pages < 20; pages += 1) {
      if (!current()) return undefined;
      const page = await documents.list(library, name, offset, {sort: 'title'});
      if (!current()) return undefined;
      const match = page.items.find(note => note.name === name);
      if (match) return match;
      if (page.nextOffset === null || page.nextOffset <= offset) return null;
      offset = page.nextOffset;
    }
    throw new Error('Today’s note could not be located safely. Refresh Notes and try again.');
  }

  async function openToday() {
    if (!selectedLibrary?.canCreate || opening || creating || todayOpening || !host.documents) return;
    const documents = host.documents;
    const account = host.user?.id;
    const targetLibrary = libraryId;
    const target = dailyNote();
    const current = () => alive && host.documents === documents && host.user?.id === account && libraryId === targetLibrary;
    todayOpening = true; opening = true; error = '';
    try {
      if (!(await ensureSaved()) || !current()) return;
      let existing = await findDaily(documents, targetLibrary, target.name, current);
      if (!current()) return;
      let document: Document;
      if (existing) {
        document = await documents.read(existing.id);
      } else {
        try {
          document = await documents.create({libraryId: targetLibrary, name: target.name, content: target.content});
        } catch (cause) {
          // A second client may have won the name, or publication may have
          // completed before its response was lost. Observe once; never issue
          // another create against a possibly occupied daily slot.
          existing = await findDaily(documents, targetLibrary, target.name, current);
          if (!current()) return;
          if (!existing) {
            if ((cause as {status?: number})?.status === 409) {
              throw new Error('Today’s note may have been created elsewhere. Refresh Notes before trying again.');
            }
            throw cause;
          }
          document = await documents.read(existing.id);
        }
      }
      // A save can begin while lookup/create is in flight. Do not abandon its
      // session unless it has confirmed; NoteSession keeps a recovery draft on failure.
      if (!(await ensureSaved()) || !current()) return;
      // An in-flight read can describe the already-open document before its
      // latest save. Keep that authoritative session instead of reconnecting a
      // stale snapshot after the second save fence.
      if (session?.view.document.id === document.id) {
        quickCapturedId = ''; mode = 'edit'; mobileEditor = true;
        await loadList();
        if (!current()) return;
        await tick(); editor?.focus();
        return;
      }
      session?.abandon(); connect(document); quickCapturedId = ''; mode = 'edit';
      await loadList();
      if (!current()) return;
      await tick(); editor?.focus();
    } catch (e) { if (current()) error = message(e); }
    finally { if (alive) { todayOpening = false; opening = false; } }
  }

  async function quickCapture() {
    if (!selectedLibrary?.canCreate || opening || creating) return;
    if (!(await ensureSaved())) return;
    opening = true;
    try {
      const name = `Note ${new Date().toISOString().replace(/[:.]/g, '-').slice(0,19)} ${crypto.randomUUID().slice(0,4)}.md`;
      const document = await host.documents!.create({ libraryId, name, content: '' });
      if (!(await ensureSaved())) return;
      session?.abandon(); connect(document); quickCapturedId = document.id; mode = 'edit'; await loadList(); await tick(); editor?.focus();
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
  async function openTodo() {
    if (opening || creating || deleting || actionBusy || !host.documents) return;
    opening = true; error = '';
    todoTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      if (!(await ensureSaved())) { error = 'Your open note could not be saved. Keep or recover the draft before opening ToDo.'; return; }
      taskWorkspace?.cancel();
      const workspace = new TaskWorkspace(host.documents, state => { if (alive && taskWorkspace === workspace) todoState = state; }, undefined, new WorkerTaskProcessor());
      taskWorkspace = workspace;
      todoPreviousMobile = mobileEditor;
      todoOpen = true; mobileEditor = true;
      void taskWorkspace.refresh();
      await tick();
    } catch (e) { error = message(e); }
    finally { opening = false; }
  }
  async function closeTodo() {
    if (todoState.busy) return;
    taskWorkspace?.cancel(); taskWorkspace = null; todoOpen = false; mobileEditor = todoPreviousMobile;
    await tick(); todoTrigger?.focus();
  }
  async function toggleTask(key: string, checked: boolean) {
    const saved = await taskWorkspace?.toggle(key, checked);
    if (alive && saved && session?.view.document.id === saved.id) session.acceptRemote(saved);
  }
  async function openTask(key: string) {
    const result = await taskWorkspace?.open(key);
    if (!alive || !result) return;
    const { document: source, task } = result;
    // ToDo entry flushed and froze the previous editor. Only an exact snapshot
    // may choose source context; a changed/reordered note requires Refresh.
    session?.abandon(); connect(source);
    libraryId = source.libraryId; query = ''; tagFilter = ''; colorFilter = ''; pinnedFilter = false;
    taskWorkspace?.cancel(); taskWorkspace = null; todoOpen = false; mode = 'edit';
    await tick();
    const body = unpack(source.content).body;
    const sourcePosition = Math.max(0, task.offset - (source.content.length - body.length));
    // HTML textareas normalize CRLF/CR; source offsets preserve original bytes.
    const position = body.slice(0, sourcePosition).replace(/\r\n?/g, '\n').length;
    editor?.focus(); editor?.setSelectionRange(position, position + 1);
    if (editor) {
      const line = body.slice(0, sourcePosition).replace(/\r\n?/g, '\n').split('\n').length;
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 26;
      editor.scrollTop = Math.max(0, (line - 3) * lineHeight);
    }
    await loadList();
  }
  async function changeLibrary(id: string) {
    if (opening || creating || deleting) return;
    opening = true;
    try {
      if (!(await ensureSaved())) return;
      session?.abandon(); session = null; view = null; mobileEditor = false;
      libraryId = id; query = ''; tagFilter = ''; colorFilter = ''; pinnedFilter = false; notes = []; await loadList(); void buildSearch(id);
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
  function organize(changes: Partial<Organization>) {
    if (!view || opening || creating || deleting || deletionUncertain) return;
    try {
      const content = withOrganization(view.content, changes);
      session?.edit(content);
      notes = notes.map(note => note.id === view!.document.id ? {...note, ...unpack(content).organization} : note);
      void save();
    } catch (e) { error = message(e); }
  }
  function addTag() {
    if (!tagInput.trim()) return;
    try {
      const tag = normalizeTag(tagInput);
      if (parsed.organization.tags.includes(tag)) { tagInput = ''; return; }
      if (parsed.organization.tags.length >= 12) throw new Error('A note can have up to 12 tags.');
      organize({ tags: [...parsed.organization.tags, tag] }); tagInput = '';
    } catch (e) { error = message(e); }
  }
  function filterTag(tag: string) { tagFilter = tagFilter === tag ? '' : tag; void loadList(); }
  function search() { clearTimeout(searchTimer); searchTimer = setTimeout(() => void loadList(), 200); }
  function connect(document: Document) {
    session = new NoteSession(document, host.documents!, drafts, current => { if (alive) view = current; });
    view = { ...session.view }; mobileEditor = true; organizeOpen = false; tagInput = '';
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
  async function continueWriting() {
    const latest = [...notes].sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0))[0];
    if (!latest) return;
    await open(latest);
    if (view?.document.id !== latest.id) return;
    mode = 'edit';
    await tick(); editor?.focus();
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
    createTemplate = ''; createContent = content; createName = name; createError = ''; createOpen = true;
  }
  function openTemplates() {
    if (!selectedLibrary?.canCreate || opening || creating || deleting || !host.documents) return;
    templateOpenDocuments = host.documents; templateOpenAccount = host.user?.id; templateOpenLibrary = libraryId;
    templateTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    templateActionError = ''; templateSelectionBusy = false; templateActionBusy = false; templatesOpen = true;
  }
  async function closeTemplates() {
    templateSelection += 1;
    templateSelectionBusy = false;
    templateActionBusy = false;
    templatesOpen = false;
    await tick();
    if (alive) templateTrigger?.focus();
  }
  function chooseTemplate(template: NoteTemplate) {
    if (!selectedLibrary?.canCreate) return;
    // A fresh default name avoids reopening an earlier identical template copy.
    const stamp = new Date().toISOString().slice(0, 10);
    beginCreate(template.content, `${template.name} ${stamp} ${crypto.randomUUID().slice(0, 8)}`);
    createTemplate = template.name;
    templatesOpen = false;
  }
  function templateContext(documents: NonNullable<Host['documents']>, account: string | undefined, library: string, ticket?: number) {
    return alive && templatesOpen && host.documents === documents && host.user?.id === account && libraryId === library && (ticket === undefined || templateSelection === ticket);
  }
  async function choosePersonalTemplate(note: Note) {
    const documents = templateOpenDocuments;
    const account = templateOpenAccount;
    const library = templateOpenLibrary;
    if (!documents || !selectedLibrary?.canCreate || templateSelectionBusy || !templateContext(documents, account, library)) return;
    const ticket = ++templateSelection;
    templateSelectionBusy = true; templateActionError = '';
    try {
      if (!(await ensureSaved())) {
        if (templateContext(documents, account, library, ticket)) templateActionError = 'Your open note could not be saved. Resolve the draft before using a template.';
        return;
      }
      if (!templateContext(documents, account, library, ticket)) return;
      const template = await readPersonalTemplate(documents, note);
      if (!templateContext(documents, account, library, ticket)) return;
      chooseTemplate(template);
    } catch (e) {
      if (templateContext(documents, account, library, ticket)) templateActionError = message(e);
    } finally {
      if (alive && templateSelection === ticket) templateSelectionBusy = false;
    }
  }
  async function toggleCurrentTemplate(enabled: boolean) {
    const current = session;
    const documents = templateOpenDocuments;
    const account = templateOpenAccount;
    const library = templateOpenLibrary;
    const ticket = templateSelection;
    const canWrite = current && (current.view.document.canWrite ?? selectedLibrary?.canCreate);
    if (!current || !documents || !canWrite || templateActionBusy || templateSelectionBusy || !templateContext(documents, account, library, ticket)) return;
    templateActionBusy = true; templateActionError = '';
    const matches = () => templateContext(documents, account, library, ticket) && session === current;
    try {
      if (!(await ensureSaved())) {
        if (matches()) templateActionError = 'Your open note could not be saved. Resolve the draft before changing its template tag.';
        return;
      }
      if (!matches()) return;
      current.edit(markPersonalTemplate(current.view.content, enabled));
      if (!(await current.save())) {
        if (matches()) templateActionError = 'This template change was not saved. Your draft is still open.';
        return;
      }
      if (!matches()) return;
      refreshDrafts(); await loadList();
      if (matches()) templateRefresh += 1;
    } catch (e) {
      if (matches()) templateActionError = message(e);
    } finally { if (matches()) templateActionBusy = false; }
  }
  async function create() {
    if (!host.documents || creating) return;
    const name = /\.(md|markdown)$/i.test(createName.trim()) ? createName.trim() : `${createName.trim()}.md`;
    if (!createName.trim()) { createError = 'Give your note a name.'; return; }
    creating = true; createError = '';
    try {
      if (createTemplate && !(await ensureSaved())) {
        createError = 'Your open note could not be saved. Close this dialog to resolve it, then try your template again.';
        return;
      }
      const document = await host.documents.create({ libraryId, name, content: createContent });
      if (session?.view.conflict && createContent === session.view.content) {
        session.abandon(); drafts.remove(session.view.document.id); session = null;
      }
      if (session?.view.dirty && !(await session.save())) {
        createError = 'The new note was saved. Resolve the open draft before switching notes.'; await loadList(); return;
      }
      if (!(await ensureSaved())) return;
      session?.abandon(); connect(document); if (createTemplate) mode = 'edit'; createOpen = false; await loadList();
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
  function beginDelete(note: Note) { if (actionNote?.id !== note.id) { deleteRequest = null; deletePending = false; } actionNote = note; actionError = ''; deleteOpen = true; }
  function beginRename(note?: Note) {
    actionNote = note ?? null; renameName = note ? title(note.name) : selectedLibrary?.name ?? '';
    actionError = ''; renameOpen = note ? 'note' : 'notebook';
  }
  function useFirstLineAsTitle() {
    if (!view || !quickCaptureTitle || !host.documents?.rename) return;
    beginRename(view.document); renameName = quickCaptureTitle;
  }
  async function rename() {
    if (actionBusy || !renameName.trim()) return;
    actionBusy = true; actionError = '';
    try {
      if (renameOpen === 'notebook') {
        if (!host.documents?.renameLibrary) throw new Error('Update Tend to rename notebooks.');
        await host.documents.renameLibrary(libraryId, renameName.trim());
        libraries = await host.documents.libraries();
      } else if (actionNote) {
        if (!host.documents?.rename) throw new Error('Update Tend to rename notes.');
        const selected = view?.document.id === actionNote.id;
        if (selected && !(await ensureSaved())) return;
        const current = selected ? view!.document : await host.documents.read(actionNote.id);
        const name = /\.(md|markdown)$/i.test(renameName.trim()) ? renameName.trim() : renameName.trim() + '.md';
        const renamed = await host.documents.rename(current.id, {name, revision: current.revision});
        if (selected) { session?.abandon(); drafts.remove(current.id); connect(renamed); quickCapturedId = ''; }
        await loadList();
      }
      renameOpen = null;
    } catch(e) { actionError = message(e); }
    finally { actionBusy = false; }
  }
  async function organizeListed(note: Note, changes: Partial<Organization>) {
    if (actionBusy) return;
    if (view?.document.id === note.id) { organize(changes); return; }
    actionBusy = true; error = '';
    try {
      const current = await host.documents!.read(note.id);
      await host.documents!.save(note.id, {content: withOrganization(current.content, changes), revision: current.revision});
      await loadList();
    } catch(e) { error = message(e); }
    finally { actionBusy = false; }
  }
  async function remove(checkOnly = false) {
    if (!actionNote || !host.documents || !deleteOpen || deleting) return;
    deleting = true; actionError = '';
    try {
      const selected = view?.document.id === actionNote.id;
      if (selected && !deletePending && !(await ensureSaved())) return;
      const trash = host.documents.trash;
      if (trash && trash.version !== 1) throw new Error('Update Notes to use this version of Tend’s recovery support.');
      if (trash?.version === 1) {
        if (!deleteRequest) {
          const current = selected ? view!.document : await host.documents.read(actionNote.id);
          deleteRequest = {documentId: current.id, revision: current.revision, operationId: crypto.randomUUID()};
        }
        const result = deletePending
          ? await (checkOnly ? trash.status(deleteRequest.operationId) : trash.move(deleteRequest))
          : await trash.move(deleteRequest);
        if (result.state === 'pending') {
          deletePending = true;
          actionError = 'Tend is still confirming this move. Check its status or retry the same request. Your recovery copy will appear in Trash.';
          return;
        }
        deletePending = false;
        if (result.state === 'failed') {
          deleteRequest = null;
          actionError = result.error?.message ?? 'This note could not be moved to Trash. Refresh and try again.';
          return;
        }
      } else {
        const current = selected ? view!.document : await host.documents.read(actionNote.id);
        await host.documents.delete(current.id, current.revision);
      }
      const newerDraft = selected && !!session?.view.dirty;
      if (newerDraft) session?.retainAfterDeletion();
      else if (selected) { session?.abandon(); session = null; view = null; mobileEditor = false; }
      if (!newerDraft) drafts.remove(actionNote.id); deleteRequest = null; deleteOpen = false; refreshDrafts(); await loadList();
    } catch (e) {
      const status = (e as {status?: number})?.status;
      if (deleteRequest && (!status || status >= 500)) deletePending = true;
      else if (!deletePending) deleteRequest = null;
      actionError = message(e);
    }
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
    if (!view || !editor || opening || creating || deleting || actionBusy || deletionUncertain) return;
    const result = editMarkdown(parsed.body, editor.selectionStart, editor.selectionEnd, before, after, prefix);
    session?.edit(withBody(view.content, result.content));
    void tick().then(() => { editor?.focus(); editor?.setSelectionRange(result.start, result.end); });
  }
  let plainNewline = false;
  function applyNewline(edit: MarkdownNewline) {
    if (!editor || !view || editor.readOnly || !session) return;
    const field = editor;
    const expected = field.value.slice(0, edit.from) + edit.text + field.value.slice(edit.to);
    field.setSelectionRange(edit.from, edit.to);
    // insertText retains native undo; setRangeText is the fallback for older webviews.
    try { document.execCommand(edit.text ? 'insertText' : 'delete', false, edit.text); } catch { /* Fall back below. */ }
    if (field.value !== expected) field.setRangeText(edit.text, edit.from, edit.to, 'end');
    field.setSelectionRange(edit.from + edit.text.length, edit.from + edit.text.length);
    if (parsed.body !== field.value) session.edit(withBody(view.content, field.value));
  }
  function editorKeydown(event: KeyboardEvent) {
    plainNewline = false;
    if (event.key !== 'Enter' || !editor || editor.readOnly || event.isComposing || event.keyCode === 229) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) { plainNewline = true; return; }
    const edit = markdownNewline(editor.value, editor.selectionStart, editor.selectionEnd);
    if (edit) { event.preventDefault(); applyNewline(edit); }
  }
  function editorBeforeInput(event: InputEvent) {
    if (!['insertLineBreak','insertParagraph'].includes(event.inputType)) return;
    if (plainNewline) { plainNewline = false; return; }
    if (!editor || editor.readOnly || event.isComposing || !event.cancelable) return;
    const edit = markdownNewline(editor.value, editor.selectionStart, editor.selectionEnd);
    if (edit) { event.preventDefault(); applyNewline(edit); }
  }
  function openMedia(kind: 'image' | 'youtube' | 'audio') {
    if (!view || deletionUncertain) return;
    mediaTarget = {id: view.document.id, content: view.content, start: editor?.selectionStart ?? parsed.body.length, end: editor?.selectionEnd ?? parsed.body.length};
    mediaKind = kind;
  }
  function insertMedia(markdown: string) {
    if (!view || !mediaTarget || view.document.id !== mediaTarget.id || view.content !== mediaTarget.content) throw new Error('Open the original note to insert this attachment.');
    const {start, end} = mediaTarget;
    session?.edit(withBody(view.content, parsed.body.slice(0, start) + '\n' + markdown + '\n' + parsed.body.slice(end)));
    mediaKind = null;
  }
  function shortcuts(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (trashOpen || todoOpen || templatesOpen || createOpen || deleteOpen || reloadOpen || backupOpen || renameOpen || mediaKind) return;
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
  function modalKey(event: KeyboardEvent) { if (event.key === 'Escape' && !creating && !deleting && !actionBusy) { createOpen = false; deleteOpen = false; reloadOpen = false; renameOpen = null; } }
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
  onDestroy(() => { alive = false; taskWorkspace?.cancel(); clearInterval(refreshTimer); clearTimeout(searchTimer); session?.abandon(); window.removeEventListener('beforeunload', leave); });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- Keyboard shortcuts belong to this extension's focused panel. -->
<div class="notes-app" class:sidebar-hidden={!sidebar || focusMode || todoOpen || trashOpen} class:focus-mode={focusMode} class:mobile-editor={mobileEditor || (!loading && ready && !libraries.length)} onkeydown={shortcuts} role="region" aria-label="TEND Notes" tabindex="-1">
  {#if !ready}
    <div class="welcome"><BookOpen size={44}/><h1>TEND Notes</h1><p>Update Tend to use your new notes space.</p><p class="muted">This extension needs Tend’s Documents editing support.</p></div>
  {:else if loading}
    <div class="welcome" role="status"><LoaderCircle class="spin"/><p>Opening your notebooks…</p></div>
  {:else}
    <aside inert={templatesOpen || todoOpen}>
      <div class="brand"><span class="brand-icon"><BookOpen size={20}/></span><div><strong>TEND Notes</strong><small>A little space to think.</small></div></div>
      <div class="library-picker">
        <label class="sr-only" for="notes-library">Notebook</label>
        <select id="notes-library" value={libraryId} onchange={selectLibrary} disabled={!libraries.length || opening}>{#each libraries as library}<option value={library.id}>{library.name}</option>{/each}</select>
        <button class="icon" class:chosen={searchOpen} bind:this={searchTrigger} aria-label="Search notes" title="Search notes" aria-expanded={searchOpen} aria-controls="notes-search" onclick={() => void toggleSearch()}><Search size={16}/></button>
        <button class="icon" aria-label="Rename notebook" title="Rename notebook" disabled={!selectedLibrary || actionBusy} onclick={() => beginRename()}><TextCursorInput size={15}/></button>
      </div>
      {#if searchOpen}<div class="search" id="notes-search"><Search size={14}/><input bind:this={searchInput} aria-label="Search your notes" placeholder="Search your notes" bind:value={query} oninput={search} onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void toggleSearch(); } }}/><button class="icon" aria-label="Close search" title="Close search" onclick={() => void toggleSearch()}><X size={14}/></button></div>{/if}
      <div class="capture-actions" aria-label="Notebook actions">
        <button class="primary new-note" aria-label="New note" title="New note" onclick={() => beginCreate()} disabled={!selectedLibrary?.canCreate}><FilePlus2 size={20}/></button>
        <button class="icon quick-capture" aria-label="Quick capture" title="Quick capture (Ctrl+Shift+N)" onclick={() => void quickCapture()} disabled={!selectedLibrary?.canCreate || opening}><Zap size={19}/></button>
        <button class="icon today-note" aria-label="Today" title="Open today’s daily note" onclick={() => void openToday()} disabled={!selectedLibrary?.canCreate || opening || todayOpening}><CalendarDays size={19}/></button>
        <button class="icon" aria-label="Templates" title="Start from a template" onclick={openTemplates} disabled={!selectedLibrary?.canCreate || opening || creating}><LayoutTemplate size={19}/></button>
        <button class="icon setup-link" aria-label={selectedLibrary?.canCreate ? 'Add notebook' : 'Set up notebook'} title={selectedLibrary?.canCreate ? 'Add notebook' : 'Set up notebook'} disabled={opening} onclick={() => void setupNotebook()}><BookPlus size={20}/></button>
      </div>
      <div class="filter-tools" bind:this={filterTools} role="group" aria-label="Note filters and views">
        <span id="notes-color-selection" class="sr-only">{colorLabel(colorFilter)}</span>
        <span id="notes-sort-selection" class="sr-only">{noteSort === 'title' ? 'Title A–Z' : 'Recently edited'}</span>
        <span id="notes-tag-selection" class="sr-only">{tagFilter ? `#${tagFilter}` : 'All tags'}</span>
        <button class="icon" class:chosen={!!colorFilter} data-note-color={colorFilter || 'none'} aria-label="Filter note color" aria-describedby="notes-color-selection" title={`Color: ${colorLabel(colorFilter)}`} aria-expanded={sidebarPopover === 'color'} aria-controls="notes-color-filter" onclick={event => void toggleFilter('color', event)}>{#if colorFilter && colorFilter !== 'none'}<span class="active-swatch"></span>{:else}<Palette size={16}/>{/if}</button>
        <button class="icon" class:chosen={pinnedFilter} aria-label={`Pinned notes (${facets.pinned})`} title={pinnedFilter ? 'Show all notes' : `Pinned notes (${facets.pinned})`} aria-pressed={pinnedFilter} onclick={() => { closeFilter(); pinnedFilter = !pinnedFilter; void loadList(); }}><Pin size={15}/></button>
        <button class="icon" class:chosen={noteSort === 'title'} aria-label="Sort notes" aria-describedby="notes-sort-selection" title={`Sort: ${noteSort === 'title' ? 'Title A–Z' : 'Recently edited'}`} aria-expanded={sidebarPopover === 'sort'} aria-controls="notes-sort" onclick={event => void toggleFilter('sort', event)}><ArrowDownWideNarrow size={16}/></button>
        <button class="icon" aria-label="ToDo" title="ToDo · Across notebooks" onclick={() => { closeFilter(); void openTodo(); }} disabled={opening || actionBusy || !libraries.length}><ListTodo size={16}/></button>
        {#if facets.tags.length || tagFilter}<button class="icon" class:chosen={!!tagFilter} aria-label="Filter by tag" aria-describedby="notes-tag-selection" title={tagFilter ? `Tag: #${tagFilter}` : 'Filter by tag'} aria-expanded={sidebarPopover === 'tags'} aria-controls="notes-tags" onclick={event => void toggleFilter('tags', event)}><Tag size={15}/></button>{/if}
        {#if sidebarPopover}<div class="filter-popover" use:dismissFilter>
          {#if sidebarPopover === 'color'}<div id="notes-color-filter" role="group" aria-label="Note color filter"><span class="popover-label">NOTE COLOR</span><button class="filter-option" aria-pressed={!colorFilter} onclick={() => { colorFilter = ''; closeFilter(true); void loadList(); }}><Palette size={15}/><span>All colors</span>{#if !colorFilter}<Check size={14}/>{/if}</button><div class="filter-swatches">{#each COLORS as color}<button data-note-color={color} class:chosen={colorFilter === color} aria-label={colorLabel(color)} aria-pressed={colorFilter === color} onclick={() => { colorFilter = color; closeFilter(true); void loadList(); }}><span class="filter-swatch">{#if colorFilter === color}<Check size={13}/>{:else if color === 'none'}<Minus size={13}/>{/if}</span><span>{colorLabel(color)}</span></button>{/each}</div></div>
          {:else if sidebarPopover === 'sort'}<div id="notes-sort" role="group" aria-label="Note sort order"><span class="popover-label">SORT NOTES</span>{#each [{value:'recent', label:'Recently edited'}, {value:'title', label:'Title A–Z'}] as option}<button class="filter-option" aria-pressed={noteSort === option.value} onclick={() => { noteSort = option.value as 'recent' | 'title'; closeFilter(true); void loadList(); }}><span>{option.label}</span>{#if noteSort === option.value}<Check size={14}/>{/if}</button>{/each}</div>
          {:else}<div id="notes-tags" role="group" aria-label="Note tags"><span class="popover-label">FILTER BY TAG</span><div class="tag-filters">{#each facets.tags as tag}<button class:chosen={tagFilter === tag.name} aria-pressed={tagFilter === tag.name} onclick={() => { filterTag(tag.name); closeFilter(true); }}>#{tag.name}<small>{tag.count}</small></button>{/each}</div>{#if tagFilter}<button class="filter-option" onclick={() => { tagFilter = ''; closeFilter(true); void loadList(); }}><X size={14}/> Clear tag</button>{/if}</div>{/if}
        </div>{/if}
      </div>
      {#if recoveries.length}<button class="quiet recovery-link" onclick={() => void showRecoveries()}>Recovery copies ({recoveries.length})</button>{/if}
      <div class="list-heading"><span>{pinnedFilter ? 'PINNED NOTES' : 'YOUR NOTES'} <small>{pinnedFilter ? facets.pinned : facets.total}</small></span><div class="list-heading-actions">{#if !mobileEditor && hasLoadedNotes}<button class="icon continue-writing" aria-label="Continue writing" title="Continue writing" disabled={opening} onclick={() => void continueWriting()}><PenLine size={14}/></button>{/if}{#if trashSupported}<button class="icon" aria-label="Trash" title="Trash" onclick={() => void openTrash()} disabled={opening || actionBusy}><Trash2 size={14}/></button>{/if}<button class="icon" aria-label="Refresh notes" title="Refresh notes" onclick={() => { void loadList(); void buildSearch(libraryId); }} disabled={listLoading}><RefreshCw size={14} class={listLoading ? 'spin' : ''}/></button></div></div>
      <div class="note-list" aria-label="Notes">
        {#each notes as note (note.id)}
          <div class="note" data-note-color={note.color ?? 'none'} class:selected={view?.document.id === note.id}>
            <button class="note-open" aria-label={`${title(note.name)} ${date(note.modifiedAt)} Markdown`} onclick={() => void open(note)} disabled={opening || actionBusy} aria-pressed={view?.document.id === note.id}><FileText size={16}/><strong>{title(note.name)}</strong></button>
            <div class="note-meta"><small>{date(note.modifiedAt)}</small><div class="list-actions" aria-label={`Actions for ${title(note.name)}`}>
              <button class="icon" class:chosen={note.pinned} aria-label={`${note.pinned ? 'Unpin' : 'Pin'} ${title(note.name)}`} title={note.pinned ? 'Unpin' : 'Pin'} disabled={actionBusy} onclick={() => void organizeListed(note, {pinned: !note.pinned})}><Pin size={13}/></button>
              <button class="icon" aria-label={`Color for ${title(note.name)}`} title="Note color" aria-expanded={colorNote === note.id} onclick={() => colorNote = colorNote === note.id ? '' : note.id}><Palette size={14}/></button>
              <button class="icon" aria-label={`Rename ${title(note.name)}`} title="Rename" disabled={actionBusy} onclick={() => beginRename(note)}><TextCursorInput size={14}/></button>
              <button class="icon" aria-label={`Delete ${title(note.name)}`} title="Delete" disabled={actionBusy} onclick={() => beginDelete(note)}><Trash2 size={13}/></button>
            </div></div>
            {#if colorNote === note.id}<div class="list-colors" aria-label={`Colors for ${title(note.name)}`}>{#each COLORS as color}<button class="color-choice" data-note-color={color} class:chosen={(note.color ?? 'none') === color} aria-pressed={(note.color ?? 'none') === color} aria-label={color === 'none' ? 'No note color' : `${color} note color`} title={color === 'none' ? 'No color' : color} disabled={actionBusy} onclick={() => { void organizeListed(note, {color}); colorNote = ''; }}>{#if (note.color ?? 'none') === color}<Check size={12}/>{/if}</button>{/each}</div>{/if}
            {#if note.tags?.length}<span class="note-tags">{note.tags.map(tag => '#' + tag).join('  ')}</span>{/if}
          </div>
        {:else}
          <div class="list-empty"><FileText size={22}/><p>{query ? 'No matching notes.' : 'Your next idea starts here.'}</p></div>
        {/each}
        {#if nextOffset !== null}<button class="quiet more" onclick={() => void loadList(true)} disabled={listLoading}>Load more notes</button>{/if}
      </div>
      <div class="sidebar-footer">{#if indexing}<small role="status">Preparing full-text search…</small>{/if}{#if indexError}<small role="status">{indexError}</small>{/if}<div class="footer-tools"><small>Markdown. Yours to keep.</small><button class="icon" aria-label="Import Markdown" title="Import Markdown" onclick={() => filePicker?.click()} disabled={!selectedLibrary?.canCreate}><Upload size={15}/></button><button class="icon" aria-label="Export & backups" title="Export & backups" onclick={() => backupOpen = true}><Download size={15}/></button></div></div>
    </aside>
    <main inert={templatesOpen}>
      {#if trashOpen && host.documents?.trash}
        <TrashPanel api={host.documents.trash} onclose={() => void closeTrash()} onchange={() => void loadList()}/>
      {:else if todoOpen}
        <TodoPanel rows={todoState.rows} loading={todoState.loading} scanned={todoState.scanned} errors={todoState.errors} busy={todoState.busy} ontoggle={(key, checked) => void toggleTask(key, checked)} onopen={key => void openTask(key)} onrefresh={() => void taskWorkspace?.refresh()} onclose={() => void closeTodo()}/>
      {:else}
      <header><button class="icon desktop-toggle" onclick={() => sidebar = !sidebar} aria-label={sidebar ? 'Hide notebooks' : 'Show notebooks'} title={sidebar ? 'Hide notebooks' : 'Show notebooks'}>{#if sidebar}<PanelLeftClose size={18}/>{:else}<PanelLeftOpen size={18}/>{/if}</button><button class="icon mobile-back" onclick={() => mobileEditor = false} aria-label="Back to notes"><ArrowLeft size={18}/></button><div class="breadcrumb">{#if view}<button class="note-title" aria-label="Rename current note" title="Rename note" onclick={() => beginRename(view!.document)}><h1>{title(view.document.name)}</h1></button>{:else}{selectedLibrary?.name ?? 'Your notes'}{/if}</div>{#if view}{#if quickCaptureTitle && host.documents?.rename}<button class="suggest-title" aria-label="Use first line as title" title={`Use “${quickCaptureTitle}” as title`} onclick={useFirstLineAsTitle}><TextCursorInput size={14}/><span>Use first line as title</span></button>{/if}<button class="icon focus-toggle" aria-label={focusMode ? "Exit focus mode" : "Focus mode"} title={focusMode ? "Exit focus mode" : "Focus mode"} onclick={() => { focusMode = !focusMode; mode = "edit"; }}>{#if focusMode}<Minimize size={16}/>{:else}<Maximize size={16}/>{/if}</button><div class="document-actions"><button class="icon" class:chosen={parsed.organization.pinned} aria-label={parsed.organization.pinned ? "Unpin note" : "Pin note"} aria-pressed={parsed.organization.pinned} title={parsed.organization.pinned ? "Unpin note" : "Pin note"} onclick={() => organize({pinned: !parsed.organization.pinned})}><Pin size={16}/></button><button class="icon" aria-label="Organize note" title="Tags and color" aria-expanded={organizeOpen} onclick={() => organizeOpen = !organizeOpen}><Tag size={16}/></button><button class="icon" aria-label="Export Markdown" title="Export Markdown" onclick={() => download(view!.content, view!.document.name)}><Download size={17}/></button><button class="icon" aria-label="Delete note" title="Delete note" onclick={() => beginDelete(view!.document)}><Trash2 size={16}/></button></div><div class="view-modes" aria-label="Editor view"><button class:active={mode === 'edit'} class="icon" aria-label="Edit Markdown" title="Edit Markdown" onclick={() => mode = 'edit'}><PenLine size={16}/></button><button class:active={mode === 'split'} class="icon split-button" aria-label="Split view" title="Split view" aria-pressed={mode === 'split'} onclick={() => mode = mode === 'split' ? 'edit' : 'split'}><Columns2 size={16}/></button><button class:active={mode === 'preview'} class="icon" aria-label="Preview" title="Preview" onclick={() => mode = 'preview'}><Eye size={17}/></button></div>{/if}</header>
      {#if error}<div class="notice error" role="alert">{error}<button class="icon" aria-label="Dismiss message" onclick={() => error = ''}><X size={15}/></button></div>{/if}
      {#if recoveries.length && !view}
        <div class="recovery"><strong>Pick up an unsaved draft</strong><p>Recovery copies from this browser are ready when you are.</p>{#each recoveries as draft}<div><button class="quiet" onclick={() => void recover(draft)} disabled={opening}>{title(draft.document.name)}</button><button class="icon" aria-label={`Export recovery copy of ${draft.document.name}`} onclick={() => download(draft.content, draft.document.name)}><Download size={15}/></button></div>{/each}</div>
      {/if}
      {#if view}
        {#if organizeOpen}<section class="organization" aria-label="Note organization"><div class="tag-editor"><div class="note-tag-chips">{#each parsed.organization.tags as tag}<span>#{tag}<button class="icon" aria-label={`Remove tag ${tag}`} onclick={() => organize({tags:parsed.organization.tags.filter(t => t !== tag)})}><X size={11}/></button></span>{/each}</div><form onsubmit={e => { e.preventDefault(); addTag(); }}><input aria-label="Add tag" placeholder="Add a tag, e.g. work/ideas" bind:value={tagInput} maxlength="50"/><button class="quiet" type="submit" disabled={!tagInput.trim()}><Plus size={14}/> Add</button></form></div><div class="note-colors" aria-label="Note color">{#each COLORS as color}<button class="color-choice" data-note-color={color} class:chosen={parsed.organization.color === color} aria-label={color === 'none' ? 'No note color' : `${color} note color`} aria-pressed={parsed.organization.color === color} title={color === 'none' ? 'No color' : color} onclick={() => organize({color})}>{#if parsed.organization.color === color}<Check size={13}/>{/if}</button>{/each}</div></section>{/if}
        {#if view.error || view.recoveryError}<div class="notice error" role="alert"><div>{view.error || view.recoveryError}<div class="notice-actions">{#if view.conflict}<button class="quiet" onclick={() => reloadOpen = true}>Reload saved version</button><button class="quiet" onclick={() => beginCreate(view!.content, `${title(view!.document.name)} copy`)}>Save as new note</button>{:else}<button class="quiet" onclick={() => void save()}>Retry save</button>{/if}<button class="quiet" onclick={() => download(view!.content, view!.document.name)}>Export draft</button></div></div></div>{/if}
        {#if mode !== 'preview'}<div class="formatting" aria-label="Markdown formatting">
          <select aria-label="Heading level" title="Heading level" value="" onchange={e => { if(e.currentTarget.value) format(e.currentTarget.value, '', true); e.currentTarget.value = ''; }}><option value="">Heading</option><option value="# ">Heading 1</option><option value="## ">Heading 2</option><option value="### ">Heading 3</option></select>
          <button class="icon" title="Bold (Ctrl+B)" aria-label="Bold" onclick={() => format('**', '**')}><Bold size={16}/></button>
          <button class="icon" title="Italic (Ctrl+I)" aria-label="Italic" onclick={() => format('*', '*')}><Italic size={16}/></button>
          <button class="icon" title="Strikethrough" aria-label="Strikethrough" onclick={() => format('~~', '~~')}><Strikethrough size={16}/></button>
          <span></span>
          <button class="icon" title="Bullet list" aria-label="Bullet list" onclick={() => format('- ', '', true)}><List size={17}/></button>
          <button class="icon" title="Numbered list" aria-label="Numbered list" onclick={() => format('1. ', '', true)}><ListOrdered size={17}/></button>
          <button class="icon" title="Checklist" aria-label="Checklist" onclick={() => format('- [ ] ', '', true)}><ListTodo size={17}/></button>
          <button class="icon" title="Block quote" aria-label="Block quote" onclick={() => format('> ', '', true)}><Quote size={16}/></button>
          <button class="icon" title="Insert link" aria-label="Insert link" onclick={() => format('[', '](https://)')}><Link size={16}/></button>
          <button class="icon" title="Inline code" aria-label="Inline code" onclick={() => format('`', '`')}><Code size={17}/></button>
          <button class="icon" title="Code block" aria-label="Code block" onclick={() => format('\n```text\n', '\n```\n')}><SquareCode size={17}/></button>
          <button class="icon" title="Table" aria-label="Insert table" onclick={() => format('\n| Column | Column |\n| --- | --- |\n| ', ' |  |\n')}><Table2 size={16}/></button>
          <button class="icon" title="Divider" aria-label="Insert divider" onclick={() => format('\n\n---\n\n')}><Minus size={16}/></button>
          <span></span>
          <button class="icon" title="Image · upload or link" aria-label="Insert image" onclick={() => openMedia('image')}><ImagePlus size={18}/></button>
          <button class="icon" title="YouTube video" aria-label="Insert YouTube video" onclick={() => openMedia('youtube')}><Youtube size={18}/></button>
          <button class="icon" title="Audio · upload or record" aria-label="Insert audio" onclick={() => openMedia('audio')}><Mic size={17}/></button>
        </div>{/if}
        <div class="writing" class:split={mode === 'split'} class:preview-only={mode === 'preview'}>
          {#if mode !== 'preview'}<textarea class="editor" bind:this={editor} aria-label="Note Markdown" onkeydown={editorKeydown} onbeforeinput={editorBeforeInput} onkeyup={() => plainNewline = false} readonly={opening || creating || deleting || actionBusy || deletionUncertain || !!mediaKind} value={parsed.body} oninput={e => { if (!deletionUncertain) session?.edit(withBody(view!.content, e.currentTarget.value)); }} placeholder="Start with a thought…" spellcheck="true"></textarea>{/if}
          {#if mode !== 'edit'}<!-- svelte-ignore a11y_click_events_have_key_events --><!-- svelte-ignore a11y_no_static_element_interactions --><div class="preview"><Preview content={parsed.body} documents={host.documents!} noteId={view.document.id}/></div>{/if}
        </div>
        <footer><span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span><button class="save-status" onclick={() => void save()} disabled={view.saving || !view.dirty || view.conflict}>{#if view.saving}<LoaderCircle size={13} class="spin"/> Saving…{:else if view.dirty}<span class="unsaved-dot"></span>{view.error ? 'Not saved' : 'Save now'}{:else}<Check size={14}/> All changes saved{/if}</button></footer>
      {:else}
        <div class="welcome"><span class="welcome-icon"><BookOpen size={37} strokeWidth={1.4}/></span><span class="eyebrow">YOUR OWN QUIET CORNER</span>{#if !libraries.length}<h1>Make room for an idea.</h1><p>Tend prepares a protected home for your notes on your server. Start writing, then choose a backup destination whenever you’re ready.</p><button class="primary" disabled={opening} onclick={() => void setupNotebook()}><FolderOpen size={17}/> Set up your notebook</button>{:else if hasLoadedNotes}<h1>Pick up where you left off.</h1><p>Return to a recent note, or capture a new thought without naming it first.</p><button class="primary" disabled={opening} onclick={() => void continueWriting()}><PenLine size={17}/> Continue writing</button>{#if selectedLibrary?.canCreate}<button class="quiet" disabled={opening} onclick={() => void quickCapture()}><Zap size={14}/> Quick capture</button>{/if}{:else if facets.total > 0}<h1>No notes match these filters.</h1><p>Clear the filters to continue writing, or capture a new thought without naming it first.</p><button class="primary" disabled={opening} onclick={() => { query = ''; tagFilter = ''; colorFilter = ''; pinnedFilter = false; void loadList(); }}>Clear filters</button>{#if selectedLibrary?.canCreate}<button class="quiet" disabled={opening} onclick={() => void quickCapture()}><Zap size={14}/> Quick capture</button>{/if}{:else if !selectedLibrary?.canCreate}<h1>Make room for an idea.</h1><p>Choose a connected notebook or let Tend prepare a new one to start writing.</p><button class="primary" disabled={opening} onclick={() => void setupNotebook()}>Set up your notebook</button>{:else}<h1>Make room for an idea.</h1><p>A quick thought. A plan taking shape. Something worth remembering.<br/>Keep it here, in your own words.</p><button class="primary" onclick={() => beginCreate()}><Plus size={17}/> Write your first note</button><button class="quiet" onclick={() => filePicker?.click()}><Upload size={14}/> Bring a Markdown file</button>{/if}<small>Simple to write. Easy to take with you.</small></div>
      {/if}
      {/if}
    </main>
    <input class="hidden" bind:this={filePicker} type="file" accept=".md,.markdown,text/markdown" onchange={importFile}/>
  {/if}
  {#if templatesOpen && templateOpenDocuments}<TemplatePicker
    select={chooseTemplate}
    selectPersonal={choosePersonalTemplate}
    toggleCurrent={toggleCurrentTemplate}
    close={() => void closeTemplates()}
    api={templateOpenDocuments}
    libraryId={templateOpenLibrary}
    isCurrent={() => templateContext(templateOpenDocuments!, templateOpenAccount, templateOpenLibrary)}
    currentPersonal={isPersonalTemplate(view?.content ?? '')}
    hasCurrentNote={!!view}
    canToggleCurrent={!!view && (view.document.canWrite ?? selectedLibrary?.canCreate ?? false)}
    selectionBusy={templateSelectionBusy}
    actionBusy={templateActionBusy}
    actionError={templateActionError}
    refreshKey={templateRefresh}
  />{/if}
  {#if backupOpen}<BackupPanel api={host.documents?.backups} {libraryId} libraryName={selectedLibrary?.name ?? "Current notebook"} beforeAction={ensureSaved} close={() => backupOpen = false}/>{/if}
  {#if createOpen || deleteOpen || reloadOpen || renameOpen}
    <div class="notes-dialog-layer" role="presentation"><div class="notes-dialog" use:focusDialog role="dialog" aria-modal="true" aria-label={renameOpen ? 'Rename ' + renameOpen : createOpen ? 'New note' : deleteOpen ? 'Delete note' : 'Reload saved version'} tabindex="-1" onkeydown={modalKey}>
      <button class="icon close" aria-label="Close dialog" onclick={() => { createOpen = false; deleteOpen = false; reloadOpen = false; renameOpen = null; }} disabled={creating || deleting || actionBusy}><X size={18}/></button>
      {#if renameOpen}<TextCursorInput size={26}/><h2>Rename {renameOpen}</h2><form onsubmit={e => { e.preventDefault(); void rename(); }}><label for="rename-name">{renameOpen === 'note' ? 'Note' : 'Notebook'} name</label><input id="rename-name" bind:value={renameName} maxlength={renameOpen === 'note' ? 220 : 120} required disabled={actionBusy}/><small>{renameOpen === 'note' ? 'The Markdown filename changes. Your writing stays intact.' : 'A name that makes this notebook easy to find.'}</small><button class="primary" disabled={actionBusy || !renameName.trim()}>{actionBusy ? 'Renaming…' : 'Save name'}</button></form>
      {:else if createOpen}<BookOpen size={26}/><h2>{createTemplate ? createTemplate : 'A fresh page.'}</h2><p>{createTemplate ? 'Create a new copy to make your own. Your earlier notes stay as they are.' : 'Give your note a name. You can start writing right away.'}</p><form onsubmit={e => { e.preventDefault(); void create(); }}><label for="new-note-name">Note name</label><input id="new-note-name" bind:value={createName} placeholder="An idea worth keeping" maxlength="220" required disabled={creating}/><small>Saved as a Markdown file in {selectedLibrary?.name}.</small>{#if createError}<p class="form-error" role="alert">{createError}</p>{/if}<button class="primary" type="submit" disabled={creating}>{#if creating}<LoaderCircle size={16} class="spin"/> Creating…{:else}<Plus size={16}/> Create note{/if}</button></form>
      {:else if deleteOpen}<Trash2 size={26}/><h2>{trashSupported ? 'Move this note to Trash?' : 'Delete this note?'}</h2><p>“{actionNote ? title(actionNote.name) : ''}” {trashSupported ? 'will stay in Trash until you restore or permanently delete it.' : 'will be permanently deleted from its storage folder. This cannot be undone.'}</p><div class="dialog-actions"><button onclick={() => deleteOpen = false} disabled={deleting}>{deletePending ? 'Close' : 'Cancel'}</button>{#if deletePending}<button onclick={() => void remove(true)} disabled={deleting}>Check status</button>{/if}<button class="danger" onclick={() => void remove()} disabled={deleting}>{deleting ? 'Confirming…' : deletePending ? 'Retry same request' : trashSupported ? 'Move to Trash' : 'Delete note'}</button></div>
      {:else}<RefreshCw size={26}/><h2>Replace this draft?</h2><p>Your current unsaved edits will be replaced by the saved version. Export a copy first if you want to keep them.</p><button class="quiet" onclick={() => download(view!.content, view!.document.name)}>Export draft</button><button class="danger" onclick={() => void reload()}>Reload saved version</button>{/if}
      {#if actionError}<p class="form-error" role="alert">{actionError}</p>{/if}
    </div></div>
  {/if}
  {#if mediaKind && mediaTarget}<MediaDialog kind={mediaKind} documents={host.documents!} noteId={mediaTarget.id} insert={insertMedia} close={() => mediaKind = null}/>{/if}
</div>

<style>
  .notes-app{--paper:var(--color-base-100,#151b19);--ink:var(--color-base-content,#d8e3df);--wash:var(--color-base-200,#1d2622);--line:color-mix(in srgb,var(--ink) 10%,transparent);--soft:color-mix(in srgb,var(--ink) 54%,transparent);--accent:var(--color-primary,#66b798);--accent-ink:var(--color-primary-content,#071a13);--warning:var(--color-warning,#d7ac64);--danger:var(--color-error,#dc7777);--danger-ink:var(--color-error-content,#250c0c);height:100%;min-height:360px;display:grid;grid-template-columns:236px minmax(0,1fr);color:var(--ink);background:color-mix(in srgb,var(--paper) var(--tend-panel-surface-alpha,100%),transparent);font:14px/1.5 var(--font-sans,system-ui,sans-serif);position:relative;container-type:inline-size;overflow:hidden;text-align:left}
  .notes-app :global(*){box-sizing:border-box}.notes-app :global(button),.notes-app :global(input),.notes-app :global(select),.notes-app :global(textarea){font:inherit}.notes-app :global(button){cursor:pointer}.notes-app :global(button:disabled){opacity:.45;cursor:default}.notes-app :global(button:focus-visible),.notes-app :global(input:focus-visible),.notes-app :global(select:focus-visible),.notes-app :global(a:focus-visible){outline:2px solid var(--accent);outline-offset:3px}.notes-app :global(button){color:inherit}.notes-app :global(h1),.notes-app :global(h2),.notes-app :global(p){margin:0}
  aside{background:color-mix(in srgb,color-mix(in srgb,var(--wash) 70%,var(--paper)) var(--tend-panel-surface-alpha,100%),transparent);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;padding:28px 16px 18px;overflow:auto}.brand{display:flex;align-items:center;gap:11px;margin:0 8px 28px}.brand-icon{display:grid;place-items:center;width:38px;height:42px;border-radius:12px;background:var(--accent);color:var(--accent-ink)}.brand strong{display:block;font-size:16px;letter-spacing:-.4px}.brand small{display:block;color:var(--soft);font-size:10px;margin-top:2px}.library-picker{padding:0 8px;margin-bottom:16px}.library-picker label,.list-heading{font-size:10px;font-weight:600;letter-spacing:1.3px;color:var(--soft)}select option{background:var(--wash);color:var(--ink)}select{width:100%;border:0;background:transparent;color:var(--ink);margin-top:5px;padding:2px 0}.primary,.danger{display:inline-flex;justify-content:center;align-items:center;gap:9px;border:0;border-radius:9px;background:var(--accent);color:var(--accent-ink)!important;padding:10px 16px;font-weight:550;text-decoration:none;font-size:13px;box-shadow:0 2px 3px #00000008}.new-note{width:100%;justify-content:flex-start}.search{display:flex;align-items:center;gap:9px;color:var(--soft);padding:10px 8px;margin-top:14px}.search input{background:none;border:0;outline:0!important;width:100%;font-size:12px;color:var(--ink)}.search input::placeholder{color:var(--soft)}.list-heading{display:flex;align-items:center;justify-content:space-between;margin:17px 8px 8px}.note-list{overflow:auto;flex:1;min-height:84px}.note{display:flex;align-items:center;gap:10px;padding:12px;width:100%;border:1px solid transparent;background:none;border-radius:9px;text-align:left;margin-bottom:4px}.note>span{min-width:0}.note strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:550}.note small{display:block;font-size:10px;color:var(--soft);margin-top:3px}.note> :global(svg){flex-shrink:0;color:var(--soft)}.note.selected{background:var(--paper);border-color:var(--line);box-shadow:0 2px 6px #00000004}.note.selected> :global(svg){color:var(--accent)}.note:hover{background:color-mix(in srgb,var(--paper) 70%,transparent)}.sidebar-footer{padding-top:18px;border-top:1px solid var(--line);margin-top:20px}.sidebar-footer>small{font-size:10px;color:var(--soft);display:block;padding-left:8px;margin-top:8px}.quiet{display:inline-flex;gap:8px;align-items:center;border:0;background:transparent;padding:7px 8px;border-radius:6px;font-size:12px}.quiet:hover,.icon:hover{background:color-mix(in srgb,var(--ink) 6%,transparent)}.list-empty{padding:25px 12px;color:var(--soft);font-size:11px;text-align:center}.list-empty :global(svg){margin:auto auto 10px}.more{width:100%;justify-content:center}.hidden{display:none}
  main{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}header{height:60px;display:flex;align-items:center;gap:14px;padding:0 24px;border-bottom:1px solid var(--line);flex-shrink:0}.icon{width:30px;height:30px;border:0;display:inline-flex;align-items:center;justify-content:center;background:none;border-radius:6px;flex-shrink:0}.breadcrumb{font-size:11px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.suggest-title{display:inline-flex;align-items:center;gap:5px;border:0;border-radius:6px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent);padding:5px 8px;font-size:10px;white-space:nowrap}.view-modes{display:flex;gap:2px;margin-left:auto;padding:3px;background:var(--wash);border-radius:8px}.view-modes .active{background:var(--paper);box-shadow:0 1px 3px #0000000a}.welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:35px 28px;gap:17px;overflow:auto}.welcome-icon{width:76px;height:82px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--accent) 8%,var(--paper));color:var(--accent);margin-bottom:10px;transform:rotate(-5deg)}.welcome h1{font-size:clamp(24px,3cqw,34px);font-weight:500;letter-spacing:-1px}.welcome p{max-width:420px;font-size:13px;line-height:1.85;color:var(--soft)}.welcome>small{font-size:10px;color:var(--soft);margin-top:20px}.welcome .quiet{margin-top:-10px;color:var(--soft)}.eyebrow{font-size:9px;letter-spacing:1.8px;font-weight:600;color:var(--soft)}.welcome .primary{margin-top:8px}.document-actions{display:flex;gap:4px;color:var(--soft)}.formatting{display:flex;align-items:center;gap:4px;padding:0 36px 13px;border-bottom:1px solid var(--line);color:var(--soft)}.formatting>span{width:1px;height:16px;background:var(--line);margin:0 6px}.writing{flex:1;min-height:120px;display:flex;overflow:hidden}.editor{display:block;resize:none;border:0;outline:none;flex:1;width:100%;min-width:0;padding:28px 42px;line-height:1.9!important;font-size:14px!important;background:transparent;color:var(--ink);tab-size:2}.editor::placeholder{color:color-mix(in srgb,var(--ink) 30%,transparent)}.preview{padding:28px 42px;overflow:auto;flex:1;min-width:0;overflow-wrap:anywhere;line-height:1.85}.split .editor,.split .preview{width:50%;padding:24px}.split .preview{border-left:1px solid var(--line)}.preview :global(h1),.preview :global(h2),.preview :global(h3){margin:1em 0 .6em;line-height:1.4}.preview :global(p){margin:0 0 1em}.preview :global(a){color:var(--accent);text-decoration:underline}.preview :global(pre){overflow:auto;background:var(--wash);padding:16px;border-radius:8px}.preview :global(blockquote){border-left:3px solid var(--accent);margin:1em 0;padding-left:18px;color:var(--soft)}.preview :global(table){border-collapse:collapse;width:100%;font-size:12px}.preview :global(th),.preview :global(td){border:1px solid var(--line);padding:8px}.preview :global(ul),.preview :global(ol){padding-left:22px}.preview :global(input){pointer-events:none}footer{height:41px;border-top:1px solid var(--line);padding:0 28px;display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--soft);flex-shrink:0}.save-status{border:0;background:none;display:flex;align-items:center;gap:6px;font-size:10px}.save-status:disabled{opacity:1!important}.unsaved-dot{width:5px;height:5px;border-radius:50%;background:var(--warning)}.notice{margin:12px 24px 0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--danger) 24%,transparent);border-radius:8px;display:flex;justify-content:space-between;font-size:12px;background:color-mix(in srgb,var(--danger) 5%,var(--paper))}.notice-actions{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}.recovery{margin:18px 24px;padding:16px;background:var(--wash);border-radius:10px;font-size:12px}.recovery p{color:var(--soft);font-size:11px;margin:3px 0 9px}.recovery>div{display:flex;align-items:center;justify-content:space-between}.sidebar-hidden{grid-template-columns:minmax(0,1fr)}.sidebar-hidden aside{display:none}.mobile-back{display:none}
  .notes-dialog-layer{position:absolute;inset:0;z-index:10;background:color-mix(in srgb,var(--paper) 60%,transparent);backdrop-filter:blur(3px);display:grid;place-items:center;padding:20px}.notes-dialog{position:relative;background:var(--paper);padding:32px;border-radius:16px;box-shadow:0 20px 80px #0003;width:min(400px,100%);max-height:100%;overflow:auto}.notes-dialog>.close{position:absolute;right:15px;top:15px}.notes-dialog> :global(svg){color:var(--accent)}.notes-dialog h2{font-size:23px;font-weight:500;letter-spacing:-.5px;margin:18px 0 10px}.notes-dialog p{font-size:12px;color:var(--soft);margin-bottom:22px}.notes-dialog form>label{display:block;font-size:12px;font-weight:550;margin:15px 0 8px}.notes-dialog input{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:8px;color:var(--ink);background:var(--wash)}.notes-dialog form>small{display:block;color:var(--soft);font-size:10px;margin:8px 0 22px}.notes-dialog .primary{width:100%}.dialog-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.dialog-actions button{border:1px solid var(--line)}.dialog-actions .danger{margin-top:0;border-color:transparent}.notes-dialog .form-error{color:var(--danger);margin:12px 0}.danger{background:var(--danger);color:var(--danger-ink)!important;margin-top:10px}.notes-app :global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
  @container(max-width:680px){aside{padding:20px 14px}.desktop-toggle{display:none}.mobile-back{display:inline-flex}.formatting{padding:0 16px 10px}.editor,.preview{padding:22px}.split-button{display:none}.split .preview{display:none}.split .editor{width:100%}header{padding:0 16px;gap:8px}.breadcrumb{max-width:40cqw}.welcome p br{display:none}.welcome{padding:26px 18px}.document-actions{gap:0}.notes-dialog{padding:26px}.notes-dialog-layer{padding:14px}.notice{margin:10px 14px 0}}
  .focus-toggle{margin-left:auto}.focus-mode .organization,.focus-mode .formatting,.focus-mode .breadcrumb,.focus-mode .view-modes,.focus-mode .desktop-toggle{display:none}.focus-mode .editor{max-width:820px;margin:auto;height:100%;padding-top:55px}.focus-mode header{border-bottom-color:transparent}.setup-link,.recovery-link{font-size:11px;color:var(--accent);margin-top:8px;text-decoration:none}.quick-capture{font-size:11px;margin:7px 0 -8px}
  [data-note-color="none"]{--note-color:var(--soft)}[data-note-color="sage"]{--note-color:var(--accent)}[data-note-color="sky"]{--note-color:var(--color-info,#79b8d7)}[data-note-color="lavender"]{--note-color:color-mix(in oklch,#b392e3 80%,var(--ink))}[data-note-color="rose"]{--note-color:var(--danger)}[data-note-color="amber"]{--note-color:var(--warning)}
  .note:not([data-note-color="none"]){border-left:3px solid var(--note-color);background:color-mix(in srgb,var(--note-color) 5%,transparent)}.note-tags{display:block;font-size:10px;color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:165px;margin-top:5px}.note :global(.pin-mark){margin-left:auto;flex-shrink:0}.chosen{color:var(--accent)}.tag-filters .chosen{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}.tag-filters{display:flex;flex-wrap:wrap;gap:5px;max-height:90px;overflow:auto;padding:7px 0}.tag-filters button{font-size:10px;padding:4px 7px;border:1px solid var(--line);border-radius:5px;background:transparent}.tag-filters small{margin-left:6px;opacity:.65}.organization{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:0 40px 18px;flex-wrap:wrap}.tag-editor{min-width:0;flex:1}.tag-editor form{display:flex;align-items:center;gap:6px}.tag-editor input{border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);font-size:11px;width:100%;min-width:100px;padding:8px 0}.note-tag-chips{display:flex;gap:5px;flex-wrap:wrap}.note-tag-chips>span{display:flex;align-items:center;font-size:10px;border-radius:5px;background:color-mix(in srgb,var(--accent) 10%,transparent);padding-left:7px;color:var(--accent)}.note-tag-chips .icon{height:24px;width:23px}.note-colors{display:flex;gap:6px}.color-choice{width:22px;height:22px;display:grid;place-items:center;border:2px solid transparent;border-radius:50%;background:color-mix(in srgb,var(--note-color) 30%,var(--paper));color:var(--ink)}.color-choice.chosen{border-color:var(--note-color)}
  @container(max-width:680px){.organization{padding:0 22px 16px}.document-actions{flex-wrap:wrap;justify-content:flex-end;max-width:68px}.brand{margin-bottom:20px}.list-heading{margin-top:10px}}
  @container(max-width:680px){.suggest-title{width:26px;height:26px;padding:0;justify-content:center;flex-shrink:0}.suggest-title span{display:none}}
  @media(prefers-reduced-motion:reduce){.notes-app :global(.spin){animation:none}}

  /* The container cannot query itself: choose its columns with a tiny observer. */
  .notes-app:global(.narrow){grid-template-columns:minmax(0,1fr)}.notes-app:global(.narrow):not(.mobile-editor) main{display:none}.notes-app:global(.narrow).mobile-editor aside{display:none}.notes-app:global(.narrow) aside{display:flex}.notes-app:global(.narrow).mobile-editor main{display:flex}

  /* Compact tools: title/actions and formatting occupy two rows. */
  header{height:52px;padding:0 16px;gap:8px}.breadcrumb{flex:1;min-width:40px;color:var(--ink)}.note-title{border:0;background:none;padding:0;text-align:left;max-width:100%}.note-title h1{font-size:17px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.document-actions{gap:0}.view-modes{margin-left:0}.focus-toggle{margin-left:0}.formatting{padding:6px 12px;gap:2px;flex-shrink:0;overflow-x:auto;min-height:44px}.formatting select{width:82px;flex-shrink:0;font-size:11px}.formatting>span{flex-shrink:0;margin:0 3px}.editor,.preview{padding:22px 28px}.organization{padding:10px 20px}
  aside{padding-top:20px}.brand{margin-bottom:16px}.library-picker{margin-bottom:8px}.capture-actions{display:flex;align-items:center;gap:8px;margin:2px 0 12px}.capture-actions button{flex:1;width:auto;height:38px;margin:0;padding:0;display:flex;justify-content:center;border-radius:9px}.capture-actions .new-note{background:var(--accent);color:var(--accent-ink)}.capture-actions .icon{border:1px solid var(--line);background:var(--paper)}
  .note{display:block;padding:8px 7px}.note-open{display:flex;align-items:center;gap:8px;width:100%;min-width:0;background:none;border:0;padding:2px;text-align:left}.note-open strong{flex:1}.note-open :global(svg){flex-shrink:0;color:var(--soft)}.note-meta{display:flex;align-items:center;justify-content:space-between;padding-left:26px;gap:4px}.note-meta small{margin:0;white-space:nowrap}.list-actions{display:flex;gap:0}.list-actions .icon{width:25px;height:28px;color:var(--soft)}.list-actions .chosen{color:var(--accent)}.list-colors{display:flex;gap:7px;padding:8px 0 3px;justify-content:center}.list-colors .color-choice{width:25px;height:25px}.note-tags{padding-left:26px}.focus-mode .document-actions{display:none}
  @container(max-width:680px){header{height:auto;min-height:52px;padding:6px 10px;gap:2px}.document-actions{max-width:none;flex-wrap:nowrap}.document-actions .icon{width:26px}.note-title h1{font-size:14px}.formatting{padding:5px 10px}.breadcrumb{max-width:none}.split-button{display:inline-flex}.split .preview{display:block;border-left:0;border-top:1px solid var(--line)}.writing.split{flex-direction:column}.split .editor,.split .preview{width:100%;min-height:0;flex:1;padding:16px}.focus-mode .editor{padding:24px}.list-actions .icon{width:30px;height:30px}}

  /* Sidebar hierarchy: notebook, capture, smaller filters, then the notes. */
  aside{padding:16px 12px 10px;overflow:auto}.brand{margin:0 4px 13px;gap:9px}.brand-icon{width:32px;height:36px;border-radius:10px}.brand strong{font-size:14px}.brand small{font-size:9px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .library-picker{display:flex;align-items:center;gap:2px;padding:0 2px;margin:0 0 8px}.library-picker select{flex:1;width:0;min-width:0;margin:0;padding:5px 0;font-size:12px;text-overflow:ellipsis}.library-picker .icon{width:28px;height:30px;color:var(--soft)}.library-picker .chosen{color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
  .capture-actions{gap:6px;margin:0 0 5px}.capture-actions button{height:36px;border-radius:8px}.filter-tools{position:relative;display:flex;align-items:center;justify-content:space-around;gap:2px;padding:2px 3px 5px;border-bottom:1px solid var(--line);flex-shrink:0}.filter-tools>.icon{width:34px;height:32px;color:var(--soft)}.filter-tools>.chosen,.filter-tools>.icon[aria-expanded="true"]{background:color-mix(in srgb,var(--accent) 11%,transparent);color:var(--accent)}.active-swatch{width:13px;height:13px;border-radius:50%;background:var(--note-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--note-color) 18%,transparent)}
  .filter-popover{position:absolute;z-index:10;top:calc(100% + 4px);left:0;right:0;padding:10px;background:var(--paper);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 30px #0005;color:var(--ink)}.popover-label{display:block;font-size:9px;letter-spacing:1.1px;color:var(--soft);padding:1px 5px 7px;font-weight:600}.filter-option{width:100%;display:flex;align-items:center;gap:8px;text-align:left;padding:8px;border:0;border-radius:7px;background:none;font-size:11px}.filter-option>span:first-of-type{flex:1}.filter-option[aria-pressed="true"]{color:var(--accent);background:color-mix(in srgb,var(--accent) 9%,transparent)}.filter-option:hover,.filter-swatches button:hover{background:var(--wash)}.filter-swatches{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:7px}.filter-swatches button{display:flex;flex-direction:column;align-items:center;gap:5px;border:0;border-radius:8px;background:none;padding:7px 2px;font-size:10px}.filter-swatch{height:25px;width:25px;display:grid;place-items:center;border-radius:50%;background:color-mix(in srgb,var(--note-color) 65%,var(--paper));color:var(--ink);border:1px solid color-mix(in srgb,var(--note-color) 80%,var(--line))}.filter-swatches .chosen .filter-swatch{outline:2px solid var(--note-color);outline-offset:2px}.filter-popover .tag-filters{max-height:150px}
  .search{padding:4px 5px 4px 9px;margin:0 0 8px;border:1px solid var(--line);border-radius:8px;background:var(--paper)}.search .icon{width:25px;height:27px}.search input{min-width:0}.list-heading{margin:7px 2px 6px;font-size:9px;letter-spacing:1.1px}.list-heading>span{display:flex;align-items:center;gap:6px}.list-heading small{font-size:9px;letter-spacing:0;opacity:.8}.list-heading-actions{display:flex;gap:0}.list-heading-actions .icon{width:26px;height:28px;color:var(--soft)}.sidebar-footer{margin-top:10px;padding-top:8px}.footer-tools{display:flex;align-items:center;gap:2px}.footer-tools small{flex:1;font-size:9px;color:var(--soft);padding-left:3px}.footer-tools .icon{width:28px;height:30px;color:var(--soft)}
  @media(pointer:coarse){.filter-tools>.icon{height:40px;width:40px}.library-picker .icon,.list-heading-actions .icon,.footer-tools .icon{height:38px;width:36px}.capture-actions button{height:42px}.filter-swatches button{min-height:58px}}
</style>
