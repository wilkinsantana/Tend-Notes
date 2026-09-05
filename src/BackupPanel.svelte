<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { Download, CloudUpload, X, Check, LoaderCircle, HardDrive, CalendarClock, Plus } from 'lucide-svelte';
  import type { Backups, BackupState } from './host';
  let { api, libraryId, libraryName, beforeAction, close }: { api: Backups | undefined; libraryId: string; libraryName: string; beforeAction: () => Promise<boolean>; close: () => void } = $props();
  let backupState = $state<BackupState>({schedule:{destination_source_id:'',interval_minutes:0,next_run_at:null},jobs:[]});
  let destinations = $state<Array<{id:string;name:string;provider:string}>>([]);
  let destination = $state('');
  let interval = $state(0);
  let error = $state('');
  let busy = $state(false);
  let loading = $state(true);
  let scope = $state('all');
  let saved = $state(false);
  let alive = true;
  let timer: ReturnType<typeof setInterval>;
  const running = $derived(backupState.jobs.some(j => ['running','queued'].includes(j.status)));
  const latestBackup = $derived(backupState.jobs.find(j => j.status === 'completed' && j.destination_source_id));
  const date = (at: number | null) => at ? new Date(at * 1000).toLocaleString(undefined, {dateStyle:'medium',timeStyle:'short'}) : '';
  const message = (e: unknown) => e instanceof Error ? e.message : 'The request could not finish. Please try again.';
  async function refresh() { if (!api) return; try { const result = await api.state(); if(alive) backupState = result; } catch(e) { if(alive) error = message(e); } }
  async function start(toStorage: boolean) {
    if (!api || busy || running) return;
    const focus = document.activeElement as HTMLElement | null;
    busy = true; error = '';
    try {
      if (!(await beforeAction())) { error = 'Save or export the open draft before preparing a backup.'; return; }
      await api.start({libraryId:scope === 'current' ? libraryId : null,destinationSourceId:toStorage ? destination : null});
      await refresh();
    } catch(e) { error = message(e); }
    finally { busy = false; await tick(); if(alive) focus?.focus(); }
  }
  async function setupDestination() {
    if (!api?.setupDestination || busy) return;
    const focus = document.activeElement as HTMLElement | null;
    busy = true; error = ''; saved = false;
    try {
      const selected = await api.setupDestination();
      if (!alive || !selected) return;
      destinations = await api.destinations();
      destination = selected.id;
    } catch(e) { if(alive) error = message(e); }
    finally { busy = false; await tick(); if(alive) focus?.focus(); }
  }
  async function configure() {
    if (!api) return; const focus = document.activeElement as HTMLElement | null; busy = true; error = ''; saved = false;
    try { backupState = await api.configure({destinationSourceId:destination,intervalMinutes:interval}); saved = true; }
    catch(e) { error = message(e); }
    finally { busy = false; await tick(); if(alive) focus?.focus(); }
  }
  async function cancel(id: string) { if(!api) return; try { await api.cancel(id); await refresh(); } catch(e) { error=message(e); } }
  function focusPanel(node: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    queueMicrotask(() => node.querySelector<HTMLButtonElement>('button')?.focus());
    const key = (e: KeyboardEvent) => {
      if(e.key === 'Escape') { e.stopPropagation(); close(); }
      if(e.key !== 'Tab') return;
      const controls=[...node.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href]')];
      const first=controls[0],last=controls.at(-1);
      if(e.shiftKey && document.activeElement===first) { e.preventDefault(); last?.focus(); }
      else if(!e.shiftKey && document.activeElement===last) { e.preventDefault(); first?.focus(); }
    };
    node.addEventListener('keydown',key);
    return {destroy(){node.removeEventListener('keydown',key);previous?.focus();}};
  }
  onMount(() => {
    if(!api) { loading=false; return; }
    void Promise.all([api.state(),api.destinations()]).then(([current,folders])=>{if(!alive)return;backupState=current;destinations=folders;destination=current.schedule.destination_source_id;interval=current.schedule.interval_minutes;}).catch(e=>{if(alive)error=message(e);}).finally(()=>loading=false);
    timer=setInterval(()=>void refresh(),2000);
  });
  onDestroy(()=>{alive=false;clearInterval(timer);});
</script>

<div class="backup-overlay" role="presentation"><div class="backup-panel" use:focusPanel role="dialog" aria-modal="true" aria-label="Export and backups" tabindex="-1">
  <header><span class="backup-mark"><HardDrive size={22}/></span><div><h2>Your notes. Anywhere.</h2><p>Portable Markdown, with tags, colors, and pins included.</p></div><button class="icon-close" aria-label="Close export and backups" onclick={close}><X size={19}/></button></header>
  {#if !api}<p class="notice">Update Tend to use notebook exports and connected-drive backups.</p>
  {:else if loading}<p role="status">Opening backup options…</p>
  {:else}
    {#if error}<p class="notice" role="alert">{error}</p>{/if}
    <div class="backup-section"><h3><Download size={16}/> Download your notes</h3><p>A ZIP of ordinary Markdown files, grouped by notebook. Open them in any Markdown app. To restore into Tend, extract the ZIP into your Documents folders and scan them in Files.</p><label for="notes-export-scope">Include</label><div class="action-row"><select id="notes-export-scope" bind:value={scope}><option value="all">All active notebooks</option><option value="current">{libraryName}</option></select><button class="primary" onclick={()=>void start(false)} disabled={busy || running || !libraryId}><Download size={15}/> Prepare ZIP</button></div></div>
    <div class="backup-section"><h3><CloudUpload size={17}/> Keep another copy</h3><p>Save a dated ZIP to a connected drive. Each backup keeps its own copy, so deleting a note won’t remove earlier backups.</p>
      {#if !destinations.length}<p class="setup">Add a destination to keep another copy of your notes on Google Drive, another cloud service, or a server folder.</p>{:else}
        <label for="notes-backup-destination">Backup folder</label><select id="notes-backup-destination" bind:value={destination} onchange={()=>saved=false}><option value="">Choose a connected folder…</option>{#if destination && !destinations.some(d=>d.id===destination)}<option value={destination}>Previously selected folder is unavailable</option>{/if}{#each destinations as folder}<option value={folder.id}>{folder.name}</option>{/each}</select>
        <div class="action-row destination-actions"><small>ZIP files are saved in “TEND Notes backups”.</small><button class="secondary" onclick={()=>void start(true)} disabled={!destination || busy || running}><CloudUpload size={15}/> Back up now</button></div>
      {/if}
      {#if api.setupDestination}<button class="secondary add-destination" onclick={()=>void setupDestination()} disabled={busy}><Plus size={15}/> Add backup destination</button>{:else}<p class="setup">Update Tend to set up storage directly in Notes.</p>{/if}
      <div class="schedule"><label for="notes-backup-frequency"><CalendarClock size={15}/> Automatic backups</label><div class="action-row"><select id="notes-backup-frequency" bind:value={interval} onchange={()=>saved=false}><option value={0}>Paused</option><option value={60}>Every hour</option><option value={1440}>Every day</option><option value={10080}>Every week</option></select><button class="secondary" onclick={()=>void configure()} disabled={busy || (interval > 0 && !destination)}>Save schedule</button></div><small>Scheduled backups include all active notebooks and run while your Tend panel is online. Existing backup copies stay in your storage until you remove them.</small>{#if saved}<p class="success" role="status"><Check size={13}/> {interval ? 'Automatic backups enabled.' : 'Automatic backups paused.'}</p>{/if}{#if backupState.schedule.next_run_at}<small>Next backup: {date(backupState.schedule.next_run_at)}</small>{/if}{#if latestBackup}<small>Last verified backup: {date(latestBackup.completed_at)}</small>{/if}</div>
    </div>
    {#if backupState.jobs.length}<div class="backup-section history"><h3>Recent exports & backups</h3>{#each backupState.jobs as job}<article><div><strong>{job.destination_source_id ? 'Storage backup' : 'Markdown ZIP'}</strong><small>{date(job.created_at)}</small></div><div class="job-state">{#if ['queued','running'].includes(job.status)}<span role="status"><LoaderCircle size={13} class="spin"/>{job.completed === job.total && job.total && job.destination_source_id ? 'Verifying in storage…' : `${job.completed} of ${job.total} notes`}</span><button class="text-button" onclick={()=>void cancel(job.id)} disabled={!!job.cancel_requested}>{job.cancel_requested ? 'Stopping…' : 'Stop'}</button>{:else if job.status === 'completed'}<span class="success"><Check size={13}/>{job.destination_source_id ? 'Verified in storage' : 'Ready'}</span>{#if job.downloadAvailable}<a class="download" href={api.downloadUrl(job.id)} download>Download ZIP</a>{:else}<small>Prepare a new ZIP to download again.</small>{/if}{:else}<span class="job-error">{job.error || job.status}</span>{/if}</div></article>{/each}<small>Prepared downloads stay available for 24 hours. Storage backups remain on your selected drive.</small></div>{/if}
  {/if}
</div></div>

<style>
.backup-overlay{position:absolute;inset:0;z-index:20;background:color-mix(in srgb,var(--paper) 65%,transparent);backdrop-filter:blur(4px);display:grid;place-items:center;padding:20px}.backup-panel{width:min(640px,100%);max-height:100%;overflow:auto;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 80px #0004;padding:28px;text-align:left}.backup-panel header{display:flex;gap:12px;align-items:center;margin-bottom:24px}.backup-mark{color:var(--accent)}h2{font-size:21px;letter-spacing:-.5px;margin:0;font-weight:550}h3{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin:0 0 8px}p{font-size:12px;line-height:1.7;color:var(--soft);margin:0 0 14px}.backup-panel header p{font-size:10px;margin:4px 0 0}.icon-close{display:grid;place-items:center;margin-left:auto;border:0;background:transparent;color:var(--ink);padding:8px;cursor:pointer}.backup-section{border-top:1px solid var(--line);padding-top:20px;margin-top:20px}label{display:block;font-size:11px;margin:12px 0 7px}.action-row{display:flex;align-items:center;gap:12px}select{background:var(--wash);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12px;min-width:0;width:100%}select option{background:var(--wash);color:var(--ink)}button,a{font:inherit}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;border:0;border-radius:8px;padding:11px 14px;font-size:11px;cursor:pointer}.primary{background:var(--accent);color:var(--accent-ink)!important}.secondary{background:var(--wash);color:var(--ink);border:1px solid var(--line)}button:disabled{opacity:.45;cursor:default}small{display:block;font-size:10px;line-height:1.7;color:var(--soft)}.add-destination{margin-top:12px}.destination-actions{justify-content:space-between;margin-top:10px}.schedule{margin-top:20px;background:color-mix(in srgb,var(--wash) 50%,transparent);padding:14px;border-radius:9px}.schedule>label{display:flex;gap:7px;align-items:center;margin-top:0}.schedule>small{margin-top:9px}.success{display:inline-flex;align-items:center;gap:5px;color:var(--accent);font-size:11px}.schedule p{margin:10px 0 0}.notice,.job-error{color:var(--danger);font-size:11px}.notice{border:1px solid color-mix(in srgb,var(--danger) 25%,transparent);padding:12px;border-radius:8px}.history article{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:14px 0;padding-bottom:14px;border-bottom:1px solid var(--line)}article strong{font-size:11px;font-weight:550}.job-state{font-size:11px;max-width:65%;text-align:right;display:flex;flex-direction:column;gap:4px;align-items:flex-end}.job-state>span{display:flex;gap:5px;align-items:center}.text-button{padding:3px 0;color:var(--accent);background:none;border:0;font-size:10px;cursor:pointer}a{color:var(--accent);text-decoration:underline;font-size:11px}.backup-panel :global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}:is(button,select,a):focus-visible{outline:2px solid var(--accent);outline-offset:3px}@container(max-width:540px){.backup-overlay{padding:10px}.backup-panel{padding:20px}.action-row{flex-wrap:wrap}.action-row>*{width:100%}.job-state{max-width:58%}h2{font-size:19px}}@media(prefers-reduced-motion:reduce){.backup-panel :global(.spin){animation:none}}
</style>
