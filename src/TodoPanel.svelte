<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, CheckCircle2, Circle, FileText, ListTodo, RefreshCw, Search, TriangleAlert } from 'lucide-svelte';

  type TodoRow = {
    key: string;
    noteId: string;
    noteName: string;
    libraryName: string;
    text: string;
    checked: boolean;
    line: number;
    canWrite: boolean;
  };

  let { rows, loading, scanned, errors, busy, ontoggle, onopen, onrefresh, onclose }: {
    rows: TodoRow[];
    loading: boolean;
    scanned: number;
    errors: string[];
    busy: boolean;
    ontoggle: (key: string, checked: boolean) => void;
    onopen: (key: string) => void;
    onrefresh: () => void;
    onclose: () => void;
  } = $props();

  let query = $state('');
  let status = $state<'open' | 'completed' | 'all'>('open');
  let page = $state(1);
  let heading = $state<HTMLHeadingElement>();
  const pageSize = 100;

  const normalizedQuery = $derived(query.trim().toLocaleLowerCase());
  const matchingRows = $derived(rows.filter((row) => {
    const matchesStatus = status === 'all' || (status === 'open' ? !row.checked : row.checked);
    const haystack = `${row.text} ${row.noteName} ${row.libraryName}`.toLocaleLowerCase();
    return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
  }));
  const pageCount = $derived(Math.max(1, Math.ceil(matchingRows.length / pageSize)));
  // The workspace replaces rows after a confirmed write. Render from a clamped
  // page immediately so completing the final row cannot leave an empty page.
  const currentPage = $derived(Math.min(page, pageCount));
  const pageStart = $derived((currentPage - 1) * pageSize);
  const displayedRows = $derived(matchingRows.slice(pageStart, pageStart + pageSize));
  const groups = $derived.by(() => {
    const notebooks = new Map<string, Map<string, TodoRow[]>>();
    for (const row of displayedRows) {
      let notes = notebooks.get(row.libraryName);
      if (!notes) { notes = new Map(); notebooks.set(row.libraryName, notes); }
      const noteKey = `${row.noteId}\u0000${row.noteName}`;
      const noteRows = notes.get(noteKey) ?? [];
      noteRows.push(row);
      notes.set(noteKey, noteRows);
    }
    return [...notebooks.entries()].map(([libraryName, notes]) => ({
      libraryName,
      notes: [...notes.values()].map((noteRows) => ({ noteName: noteRows[0].noteName, rows: noteRows }))
    }));
  });
  const allDone = $derived(rows.length > 0 && rows.every((row) => row.checked));
  const hasActiveFilter = $derived(status !== 'open' || normalizedQuery.length > 0);

  $effect(() => {
    if (page > pageCount) page = pageCount;
  });

  onMount(() => heading?.focus());

  function toggle(event: Event, row: TodoRow) {
    const checkbox = event.currentTarget as HTMLInputElement;
    // A native checkbox changes before its handler. Restore its last confirmed
    // parent value while the parent attempts the write.
    checkbox.checked = row.checked;
    if (busy || !row.canWrite) return;
    // The parent changes rows only after its save succeeds, so a failed save
    // leaves this checkbox at the last confirmed value.
    ontoggle(row.key, !row.checked);
  }

  function changeStatus(next: 'open' | 'completed' | 'all') {
    status = next;
    page = 1;
  }

  function clearFilters() {
    query = '';
    status = 'open';
    page = 1;
  }
</script>

<section class="todo-panel" aria-labelledby="todo-title">
  <header class="panel-header">
    <div class="heading">
      <span class="heading-mark"><ListTodo size={20} aria-hidden="true" /></span>
      <div>
        <h1 id="todo-title" bind:this={heading} tabindex="-1">ToDo</h1>
        <p>Tasks from your notes, grouped by notebook.</p>
      </div>
    </div>
    <div class="header-actions">
      <button class="refresh" type="button" onclick={onrefresh} disabled={busy || loading} aria-label="Refresh tasks" title="Refresh tasks">
        <RefreshCw size={16} class={loading ? 'spin' : ''} aria-hidden="true" />
        <span>Refresh</span>
      </button>
      <button class="back" type="button" onclick={onclose} disabled={busy} aria-label="Back to Notes" title="Back to Notes">
        <ArrowLeft size={16} aria-hidden="true" />
        <span>Back to Notes</span>
      </button>
    </div>
  </header>

  <div class="tools">
    <label class="search">
      <Search size={16} aria-hidden="true" />
      <span class="sr-only">Search tasks, notes, and notebooks</span>
      <input bind:value={query} oninput={() => page = 1} type="search" placeholder="Search tasks" disabled={busy} />
    </label>
    <div class="status-filter" aria-label="Task status">
      <button type="button" class:active={status === 'open'} aria-pressed={status === 'open'} onclick={() => changeStatus('open')} disabled={busy}>Open</button>
      <button type="button" class:active={status === 'completed'} aria-pressed={status === 'completed'} onclick={() => changeStatus('completed')} disabled={busy}>Completed</button>
      <button type="button" class:active={status === 'all'} aria-pressed={status === 'all'} onclick={() => changeStatus('all')} disabled={busy}>All</button>
    </div>
  </div>

  {#if loading}
    <p class="scan-status" role="status"><RefreshCw size={14} class="spin" aria-hidden="true" /> Looking through your notes{scanned ? ` — ${scanned} scanned` : '…'}</p>
  {:else if scanned}
    <p class="scan-status">{scanned} note{scanned === 1 ? '' : 's'} scanned.</p>
  {/if}

  {#if errors.length}
    <aside class="errors" role="alert" aria-label="Some tasks need attention">
      <TriangleAlert size={17} aria-hidden="true" />
      <div>
        <strong>Some tasks need attention.</strong>
        <ul>{#each errors as error}<li>{error}</li>{/each}</ul>
      </div>
    </aside>
  {/if}

  <div class="task-list" aria-live="polite" aria-busy={loading || busy}>
    {#if groups.length}
      {#each groups as notebook}
        <section class="notebook-group" aria-label={notebook.libraryName}>
          <h2>{notebook.libraryName}</h2>
          {#each notebook.notes as note}
            <div class="note-group">
              <div class="note-heading"><FileText size={15} aria-hidden="true" /><span>{note.noteName}</span></div>
              <ul>
                {#each note.rows as row (row.key)}
                  <li class:completed={row.checked}>
                    <label class="task-check" title={row.canWrite ? undefined : 'You only have permission to view this note'}>
                      <input type="checkbox" checked={row.checked} disabled={busy || loading || !row.canWrite} onchange={(event) => toggle(event, row)} aria-label={`${row.checked ? 'Mark open' : 'Mark complete'}: ${row.text}`} />
                      <span class="check-icon" aria-hidden="true">
                        {#if row.checked}<CheckCircle2 size={20} />{:else}<Circle size={20} />{/if}
                      </span>
                      <span class="task-text">{row.text}</span>
                    </label>
                    <button class="open-note" type="button" onclick={() => onopen(row.key)} disabled={busy || loading} aria-label={`Open ${row.noteName}, task on line ${row.line}`}><span>Open note</span></button>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </section>
      {/each}
    {:else if loading}
      <div class="empty"><RefreshCw size={25} class="spin" aria-hidden="true" /><h2>Looking for tasks</h2><p>Your notes stay visible as they are while this list is prepared.</p></div>
    {:else if errors.length}
      <div class="empty incomplete"><TriangleAlert size={28} aria-hidden="true" /><h2>Task list is incomplete</h2><p>Some notes could not be read or updated. Refresh to try again.</p><button type="button" onclick={onrefresh} disabled={busy || loading}>Refresh</button></div>
    {:else if allDone && !hasActiveFilter}
      <div class="empty"><CheckCircle2 size={28} aria-hidden="true" /><h2>Everything is complete</h2><p>Completed tasks remain here when you want to look back.</p><button type="button" onclick={() => changeStatus('completed')}>Show completed</button></div>
    {:else if rows.length === 0}
      <div class="empty"><ListTodo size={28} aria-hidden="true" /><h2>No tasks yet</h2><p>Add a Markdown checkbox in any notebook, then refresh this view.</p></div>
    {:else}
      <div class="empty"><Search size={28} aria-hidden="true" /><h2>No tasks match</h2><p>Try another search or status.</p><button type="button" onclick={clearFilters}>Clear filters</button></div>
    {/if}
  </div>
  {#if matchingRows.length}
    <footer class="pagination" aria-label="Task pagination">
      <span>Showing {pageStart + 1}–{Math.min(pageStart + pageSize, matchingRows.length)} of {matchingRows.length}</span>
      <div class="page-controls">
        <button type="button" onclick={() => page = Math.max(1, currentPage - 1)} disabled={busy || loading || currentPage === 1} aria-label="Previous page">Prev</button>
        <span aria-current="page">Page {currentPage} of {pageCount}</span>
        <button type="button" onclick={() => page = Math.min(pageCount, currentPage + 1)} disabled={busy || loading || currentPage === pageCount} aria-label="Next page">Next</button>
      </div>
    </footer>
  {/if}
</section>

<style>
  .todo-panel{min-width:0;min-height:0;height:100%;display:flex;flex-direction:column;color:var(--ink);background:transparent;font:14px/1.5 var(--font-sans,system-ui,sans-serif);overflow:hidden}.todo-panel *{box-sizing:border-box}.panel-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 28px 17px;border-bottom:1px solid var(--line);flex-shrink:0}.heading{display:flex;align-items:center;gap:11px;min-width:0}.heading-mark{display:grid;place-items:center;width:36px;height:36px;flex:0 0 auto;border-radius:10px;background:color-mix(in srgb,var(--accent) 13%,var(--wash));color:var(--accent)}h1,h2,p{margin:0}.heading h1{font-size:20px;line-height:1.1;letter-spacing:-.4px;font-weight:600}.heading p{margin-top:3px;color:var(--soft);font-size:11px}.header-actions,.tools,.status-filter,.page-controls{display:flex;align-items:center;gap:7px}.header-actions button,.status-filter button,.empty button,.page-controls button{border:1px solid var(--line);border-radius:8px;background:var(--wash);color:var(--ink);font:inherit;cursor:pointer}.header-actions button{min-height:38px;padding:8px 10px;display:inline-flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap}.back{background:transparent!important}.header-actions button:hover,.status-filter button:hover,.empty button:hover,.page-controls button:hover{border-color:color-mix(in srgb,var(--accent) 62%,var(--line));background:color-mix(in srgb,var(--accent) 8%,var(--wash))}.tools{padding:15px 28px 9px;flex-wrap:wrap;flex-shrink:0}.search{min-width:min(250px,100%);flex:1;display:flex;align-items:center;gap:8px;padding:0 10px;height:40px;border:1px solid var(--line);border-radius:8px;background:var(--wash);color:var(--soft)}.search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:12px}.search input::placeholder{color:var(--soft)}.status-filter{padding:3px;background:var(--wash);border:1px solid var(--line);border-radius:9px}.status-filter button{border-color:transparent;background:transparent;padding:6px 9px;font-size:11px}.status-filter button.active{background:var(--paper);color:var(--accent);box-shadow:0 1px 3px #00000012}.scan-status{padding:0 28px 10px;color:var(--soft);font-size:10px;display:flex;align-items:center;gap:6px;flex-shrink:0}.errors{display:flex;flex-shrink:0;gap:9px;max-height:112px;overflow:auto;margin:0 28px 12px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));border-radius:9px;background:color-mix(in srgb,var(--accent) 6%,var(--wash));color:var(--ink);font-size:11px}.errors>:global(svg){flex:0 0 auto;color:var(--accent);margin-top:1px}.errors strong{font-weight:600}.errors ul{margin:3px 0 0;padding-left:17px;color:var(--soft)}.task-list{flex:1;overflow:auto;min-height:0;padding:3px 28px 18px}.notebook-group{margin-top:16px}.notebook-group>h2{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--soft);font-weight:650;margin:0 0 7px}.note-group{margin-bottom:11px;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--wash) 56%,transparent);overflow:hidden}.note-heading{display:flex;align-items:center;gap:7px;padding:8px 11px;border-bottom:1px solid var(--line);color:var(--soft);font-size:11px;font-weight:550;overflow:hidden}.note-heading span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.note-group ul{list-style:none;margin:0;padding:0}.note-group li{min-width:0;display:flex;align-items:center;gap:5px;border-bottom:1px solid color-mix(in srgb,var(--line) 80%,transparent)}.note-group li:last-child{border-bottom:0}.task-check{position:relative;min-height:44px;min-width:0;flex:1;display:flex;align-items:center;gap:9px;padding:9px 10px;cursor:pointer}.task-check input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}.task-check input:disabled{cursor:default}.check-icon{display:grid;place-items:center;flex:0 0 24px;color:var(--soft)}.task-check input:checked+.check-icon{color:var(--accent)}.task-check input:focus-visible+.check-icon{outline:2px solid var(--accent);outline-offset:3px;border-radius:50%}.task-text{min-width:0;overflow-wrap:anywhere;font-size:12px}.completed .task-text{text-decoration:line-through;color:var(--soft)}.open-note{flex:0 0 auto;margin-right:7px;padding:6px 7px;border:0;border-radius:6px;background:transparent;color:var(--accent);font:inherit;font-size:10px;cursor:pointer}.open-note:hover{background:color-mix(in srgb,var(--accent) 10%,transparent)}button:disabled,input:disabled{opacity:.5;cursor:default}.pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:52px;padding:8px 28px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--wash) 70%,transparent);color:var(--soft);font-size:11px;flex-shrink:0}.page-controls{white-space:nowrap}.page-controls button{min-width:44px;min-height:36px;padding:6px 9px;font-size:11px}.page-controls span{min-width:76px;text-align:center}.empty{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;gap:10px;color:var(--soft)}.empty>:global(svg){color:var(--accent)}.empty h2{font-size:16px;font-weight:550;color:var(--ink)}.empty p{max-width:330px;font-size:12px;line-height:1.65}.empty button{margin-top:3px;padding:8px 10px;font-size:11px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}:global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@container(max-width:620px){.panel-header{padding:16px;align-items:flex-start}.header-actions{flex-wrap:wrap;justify-content:flex-end}.header-actions button span{display:none}.header-actions button{min-width:38px;justify-content:center}.tools{padding:12px 16px 8px}.search{flex-basis:100%}.scan-status{padding:0 16px 8px}.errors{margin:0 16px 10px}.task-list{padding:2px 16px 14px}.pagination{padding:8px 16px;flex-wrap:wrap}.notebook-group{margin-top:13px}}@container(max-width:370px){.panel-header{gap:10px}.heading p{display:none}.status-filter{width:100%}.status-filter button{flex:1}.open-note{font-size:0;min-width:44px;min-height:44px}.open-note span{display:none}.open-note::after{content:'↗';font-size:15px}.task-check{gap:7px;padding-left:8px}.pagination{align-items:flex-start}.page-controls{width:100%;justify-content:space-between}.page-controls button{min-height:44px}.page-controls span{line-height:44px}}@media(prefers-reduced-motion:reduce){:global(.spin){animation:none}}
</style>
