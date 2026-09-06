<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ArchiveRestore, ArrowLeft, Check, FileText, LoaderCircle, RefreshCw, RotateCcw, Trash2, TriangleAlert } from 'lucide-svelte';
  import type { Trash, TrashItem, TrashOperation } from './host';

  let { api, onclose, onchange }: { api: Trash; onclose: () => void; onchange?: () => void } = $props();

  let items = $state<TrashItem[]>([]);
  let nextCursor = $state<string | null>(null);
  let cursors = $state<Array<string | undefined>>([undefined]);
  let page = $state(0);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');
  let operations = $state<Record<string, TrashOperation>>({});
  // Keep the exact admitted request while its response is uncertain. A status
  // 404 may mean the first POST never arrived; replay must be able to admit it.
  const requests = new Map<string, {action: 'restore' | 'purge'; id: string; input: {generation: number; operationId: string; name?: string}}>();
  let restoreFor = $state<string | null>(null);
  let restoreName = $state('');
  let confirmPurge = $state<string | null>(null);
  let heading = $state<HTMLHeadingElement>();

  const formatDate = (value: number) => new Date(value * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const message = (reason: unknown) => reason instanceof Error ? reason.message : 'The request could not be confirmed. Check its status before trying again.';
  const operationKey = (item: TrashItem, _action: TrashOperation['action']) => item.id;
  const operationFor = (item: TrashItem, action: TrashOperation['action']) => operations[operationKey(item, action)];
  const activeId = (item: TrashItem, action: TrashOperation['action']) => item.activeOperationId || operationFor(item, action)?.operationId || null;
  const pending = (item: TrashItem) => item.state !== 'retained' || Object.values(operations).some((operation) => operation.trashId === item.id && operation.state === 'pending');

  async function load(index = page) {
    loading = true;
    error = '';
    try {
      const result = await api.list(cursors[index]);
      items = result.items;
      nextCursor = result.nextCursor;
      page = index;
      if (result.nextCursor) cursors[index + 1] = result.nextCursor;
    } catch (reason) {
      error = message(reason);
    } finally {
      loading = false;
    }
  }

  async function refresh() {
    await load(page);
  }

  function beginRestore(item: TrashItem) {
    restoreFor = item.id;
    restoreName = item.name;
    confirmPurge = null;
  }

  function closeInline() {
    restoreFor = null;
    confirmPurge = null;
    restoreName = '';
  }

  function rememberPending(item: TrashItem, action: TrashOperation['action'], operationId: string) {
    operations = {
      ...operations,
      [operationKey(item, action)]: {
        operationId, action, state: 'pending', trashId: item.id,
        submittedAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000), result: null, error: null,
      },
    };
  }

  async function settle(item: TrashItem, action: TrashOperation['action'], operation: TrashOperation) {
    operations = { ...operations, [operationKey(item, action)]: operation };
    if (operation.state === 'pending') return;
    closeInline();
    if (operation.state === 'confirmed') onchange?.();
    await load(page);
  }

  function rejected(item: TrashItem, action: TrashOperation['action'], reason: unknown) {
    const status = (reason as {status?: number})?.status;
    if (status && status >= 400 && status < 500) {
      const operation = operations[item.id];
      if (operation) operations = {...operations, [item.id]: {...operation, state: 'failed', error: {code: 'not_admitted', message: message(reason)}}};
    }
  }

  async function restore(item: TrashItem) {
    if (busy || pending(item)) return;
    const key = operationKey(item, 'restore');
    const previous = operations[key];
    const operationId = previous?.state === 'failed' ? crypto.randomUUID() : previous?.operationId || crypto.randomUUID();
    const typed = restoreName.trim();
    const name = typed && !/\.(md|markdown)$/i.test(typed) ? typed + '.md' : typed;
    if (name.length > 240) { error = 'Use a note name of 240 characters or fewer.'; return; }
    busy = true;
    error = '';
    rememberPending(item, 'restore', operationId);
    const input = {generation: item.generation, operationId, ...(name && name !== item.name ? {name} : {})};
    requests.set(operationId, {action: 'restore', id: item.id, input});
    try {
      await settle(item, 'restore', await api.restore(item.id, input));
    } catch (reason) {
      rejected(item, 'restore', reason);
      error = pending(item) ? `${message(reason)} Your restore may still be running; use Check status.` : message(reason);
    } finally {
      busy = false;
      await tick();
    }
  }

  async function purge(item: TrashItem) {
    if (busy || pending(item)) return;
    const key = operationKey(item, 'purge');
    const previous = operations[key];
    const operationId = previous?.state === 'failed' ? crypto.randomUUID() : previous?.operationId || crypto.randomUUID();
    busy = true;
    error = '';
    rememberPending(item, 'purge', operationId);
    requests.set(operationId, {action: 'purge', id: item.id, input: {generation: item.generation, operationId}});
    try {
      await settle(item, 'purge', await api.purge(item.id, { generation: item.generation, operationId, confirmed: true }));
    } catch (reason) {
      rejected(item, 'purge', reason);
      error = pending(item) ? `${message(reason)} Permanent deletion may still be running; use Check status.` : message(reason);
    } finally {
      busy = false;
      await tick();
    }
  }

  async function check(item: TrashItem) {
    const operationId = activeId(item, 'restore') || activeId(item, 'purge');
    if (!operationId || busy) return;
    busy = true;
    error = '';
    try {
      const operation = await api.status(operationId);
      const action = operation.action;
      await settle(item, action, operation);
    } catch (reason) {
      error = message(reason);
    } finally {
      busy = false;
    }
  }

  async function retry(item: TrashItem) {
    const operationId = activeId(item, 'restore') || activeId(item, 'purge');
    if (!operationId || busy) return;
    busy = true;
    error = '';
    try {
      const request = requests.get(operationId);
      const operation = request ? await (request.action === 'restore' ? api.restore(request.id, request.input) : api.purge(request.id, {...request.input, confirmed: true})) : await api.retry(operationId);
      const action = operation.action;
      await settle(item, action, operation);
    } catch (reason) {
      error = message(reason);
    } finally {
      busy = false;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || busy) return;
    if (restoreFor || confirmPurge) { event.stopPropagation(); closeInline(); return; }
    onclose();
  }

  onMount(() => {
    void load();
    heading?.focus();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- Escape handles the focused controls in this panel. -->
<section class="trash-panel" aria-labelledby="trash-title" onkeydown={onKeydown}>
  <header class="panel-header">
    <div class="heading">
      <span class="heading-mark"><Trash2 size={20} aria-hidden="true" /></span>
      <div>
        <h1 id="trash-title" bind:this={heading} tabindex="-1">Trash</h1>
        <p>Deleted notes stay here until you permanently delete them.</p>
      </div>
    </div>
    <div class="header-actions">
      <button type="button" onclick={() => void refresh()} disabled={loading || busy} aria-label="Refresh Trash" title="Refresh Trash"><RefreshCw size={16} class={loading ? 'spin' : ''} aria-hidden="true" /><span>Refresh</span></button>
      <button class="back" type="button" onclick={onclose} disabled={busy} aria-label="Back to Notes" title="Back to Notes"><ArrowLeft size={16} aria-hidden="true" /><span>Back to Notes</span></button>
    </div>
  </header>

  <p class="retention"><TriangleAlert size={14} aria-hidden="true" /> Trash is retained on your notebook server until you permanently delete it. It is not included in Notes backups yet.</p>
  {#if error}<aside class="error" role="alert">{error}</aside>{/if}

  <div class="trash-list" aria-live="polite" aria-busy={loading || busy}>
    {#if loading}
      <div class="empty"><LoaderCircle size={27} class="spin" aria-hidden="true" /><h2>Opening Trash</h2><p>Your deleted notes are being checked.</p></div>
    {:else if items.length}
      {#each items as item (item.id)}
        {@const known = operationFor(item, 'restore') || operationFor(item, 'purge')}
        <article class:pending={pending(item)}>
          <div class="note-icon"><FileText size={17} aria-hidden="true" /></div>
          <div class="item-copy">
            <strong>{item.name}</strong>
            <span>{item.libraryName} · Deleted {formatDate(item.deletedAt)}</span>
            {#if pending(item)}
              <p class="operation" role="status"><LoaderCircle size={13} class="spin" aria-hidden="true" /> {known?.state === 'failed' ? 'This operation needs attention.' : `${item.state === 'moving' ? 'Moving' : item.state === 'restoring' ? 'Restoring' : 'Permanently deleting'} — confirmation is still pending.`}</p>
            {:else if known?.state === 'failed'}
              <p class="operation failed" role="alert"><TriangleAlert size={13} aria-hidden="true" /> {known.error?.message || 'That operation did not finish. You can try again.'}</p>
            {/if}
          </div>
          <div class="item-actions">
            {#if pending(item)}
              <button type="button" onclick={() => void check(item)} disabled={busy}><RefreshCw size={14} aria-hidden="true" /> Check status</button>
              <button type="button" onclick={() => void retry(item)} disabled={busy || !activeId(item, 'restore') && !activeId(item, 'purge')}><RotateCcw size={14} aria-hidden="true" /> Retry</button>
            {:else if confirmPurge === item.id}
              <p class="confirm-copy">Permanently delete <strong>{item.name}</strong>? This cannot be undone.</p>
              <button type="button" onclick={closeInline} disabled={busy}>Cancel</button>
              <button class="danger" type="button" onclick={() => void purge(item)} disabled={busy}><Trash2 size={14} aria-hidden="true" /> Delete</button>
            {:else if restoreFor === item.id}
              <label class="restore-name">Restore as <input bind:value={restoreName} maxlength="240" aria-label={`Restore ${item.name} as`} disabled={busy} /></label>
              <button type="button" onclick={closeInline} disabled={busy}>Cancel</button>
              <button class="primary" type="button" onclick={() => void restore(item)} disabled={busy}><ArchiveRestore size={14} aria-hidden="true" /> Restore</button>
            {:else}
              <button class="primary" type="button" onclick={() => beginRestore(item)} disabled={busy}><ArchiveRestore size={14} aria-hidden="true" /> Restore</button>
              <button class="danger-quiet" type="button" onclick={() => { confirmPurge = item.id; restoreFor = null; }} disabled={busy}><Trash2 size={14} aria-hidden="true" /> Permanently delete</button>
            {/if}
          </div>
        </article>
      {/each}
    {:else}
      <div class="empty"><Check size={28} aria-hidden="true" /><h2>Trash is empty</h2><p>Deleted notes will appear here until you restore or permanently delete them.</p></div>
    {/if}
  </div>

  {#if !loading && (page > 0 || nextCursor)}
    <footer class="pagination" aria-label="Trash pagination">
      <span>Page {page + 1}</span>
      <div>
        <button type="button" onclick={() => void load(page - 1)} disabled={busy || page === 0}>Prev</button>
        <button type="button" onclick={() => void load(page + 1)} disabled={busy || !nextCursor}>Next</button>
      </div>
    </footer>
  {/if}
</section>

<style>
  .trash-panel{height:100%;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;color:var(--ink);font:14px/1.5 var(--font-sans,system-ui,sans-serif)}.trash-panel *{box-sizing:border-box}h1,h2,p{margin:0}.panel-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 28px 17px;border-bottom:1px solid var(--line);flex-shrink:0}.heading{display:flex;align-items:center;gap:11px;min-width:0}.heading-mark{display:grid;place-items:center;width:36px;height:36px;flex:0 0 auto;border-radius:10px;background:color-mix(in srgb,var(--accent) 13%,var(--wash));color:var(--accent)}.heading h1{font-size:20px;line-height:1.1;letter-spacing:-.4px;font-weight:600}.heading p{margin-top:3px;color:var(--soft);font-size:11px}.header-actions,.item-actions,.pagination,.pagination>div{display:flex;align-items:center;gap:7px}.header-actions button,.item-actions button,.pagination button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--wash);color:var(--ink);font:inherit;font-size:11px;cursor:pointer}.header-actions button:hover,.item-actions button:hover,.pagination button:hover{border-color:color-mix(in srgb,var(--accent) 62%,var(--line));background:color-mix(in srgb,var(--accent) 8%,var(--wash))}.header-actions .back{background:transparent}.retention{display:flex;align-items:flex-start;gap:7px;margin:12px 28px 0;color:var(--soft);font-size:10px;line-height:1.55}.retention :global(svg){flex:0 0 auto;color:var(--accent);margin-top:1px}.error{margin:10px 28px 0;padding:10px 12px;border:1px solid color-mix(in srgb,var(--danger) 35%,var(--line));border-radius:9px;background:color-mix(in srgb,var(--danger) 7%,var(--wash));color:var(--ink);font-size:11px}.trash-list{flex:1;min-height:0;overflow:auto;padding:14px 28px 18px}article{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:13px 12px;border-bottom:1px solid var(--line)}article:first-child{border-top:1px solid var(--line)}article.pending{background:color-mix(in srgb,var(--accent) 4%,transparent)}.note-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--wash);color:var(--accent)}.item-copy{min-width:0}.item-copy strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}.item-copy>span{display:block;margin-top:2px;color:var(--soft);font-size:10px}.operation{display:flex;align-items:center;gap:5px;margin-top:6px;color:var(--soft);font-size:10px}.operation.failed{color:var(--danger)}.item-actions{justify-content:flex-end;flex-wrap:wrap;max-width:390px}.item-actions .primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.item-actions .danger{background:var(--danger);border-color:var(--danger);color:white}.item-actions .danger-quiet{color:var(--danger)}.confirm-copy{width:100%;color:var(--soft);font-size:10px;text-align:right}.restore-name{display:flex;align-items:center;gap:6px;color:var(--soft);font-size:10px}.restore-name input{width:150px;min-height:34px;padding:6px 8px;border:1px solid var(--line);border-radius:7px;background:var(--wash);color:var(--ink);font:inherit;font-size:11px}.empty{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px;text-align:center;color:var(--soft)}.empty>:global(svg){color:var(--accent)}.empty h2{font-size:16px;font-weight:550;color:var(--ink)}.empty p{max-width:330px;font-size:12px;line-height:1.65}.pagination{justify-content:space-between;min-height:52px;padding:8px 28px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--wash) 70%,transparent);color:var(--soft);font-size:11px;flex-shrink:0}button:disabled,input:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}:global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@container(max-width:620px){.panel-header{padding:16px;align-items:flex-start}.header-actions button span{display:none}.header-actions button{min-width:38px}.retention,.error{margin-left:16px;margin-right:16px}.trash-list{padding-left:16px;padding-right:16px}article{grid-template-columns:auto minmax(0,1fr)}.item-actions{grid-column:1/-1;justify-content:flex-start;max-width:none}.confirm-copy{text-align:left}.pagination{padding:8px 16px}}@container(max-width:390px){.heading p{display:none}.item-actions button{min-height:42px}.restore-name{width:100%;justify-content:space-between}.restore-name input{flex:1;min-width:0}.pagination{flex-wrap:wrap}.pagination>div{width:100%;justify-content:space-between}.pagination button{min-width:48%}}@media(prefers-reduced-motion:reduce){:global(.spin){animation:none}}
  .trash-panel .retention{margin:12px 28px 0}.trash-panel .operation{margin-top:6px}.trash-panel .heading p{margin-top:3px}
  @container(max-width:620px){.trash-panel .retention{margin-left:16px;margin-right:16px}}
</style>
