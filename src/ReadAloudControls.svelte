<script lang="ts">
  import { LoaderCircle, Pause, Play, Square } from 'lucide-svelte';
  let {phase, scope, progress, error, follow, onpause, onresume, onstop, onfollowchange}: {
    phase: 'idle'|'starting'|'playing'|'paused';
    scope: string;
    progress: {completed: number; total: number};
    error: string;
    follow: boolean;
    onpause: () => unknown;
    onresume: () => unknown;
    onstop: () => void;
    onfollowchange: (follow: boolean) => void;
  } = $props();
  const percent = $derived(progress.total > 0 ? Math.min(100, Math.round(progress.completed / progress.total * 100)) : 0);
</script>

<div class="read-controls" role={error ? 'alert' : 'status'}>
  {#if error}<span>{error}</span>
  {:else}<span class="scope">{scope}</span><span>{phase === 'starting' ? 'Preparing speech…' : phase === 'paused' ? 'Paused' : 'Reading aloud'}{progress.total ? ` · ${percent}% prepared` : ''}</span><label><input type="checkbox" checked={follow} onchange={event => onfollowchange(event.currentTarget.checked)}/> Follow reading</label>{/if}
  <div>{#if !error && phase === 'starting'}<LoaderCircle class="spin" size={15}/>{:else if !error && phase === 'playing'}<button aria-label="Pause read aloud" title="Pause" onclick={() => void onpause()}><Pause size={15}/></button>{:else if !error && phase === 'paused'}<button aria-label="Resume read aloud" title="Resume" onclick={() => void onresume()}><Play size={15}/></button>{/if}{#if !error || phase !== 'idle'}<button aria-label="Stop read aloud" title="Stop" onclick={onstop}><Square size={14}/></button>{:else}<button onclick={onstop}>Dismiss</button>{/if}</div>
</div>

<style>
  .read-controls{min-height:42px;display:flex;align-items:center;gap:10px;padding:6px 18px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--accent) 7%,var(--paper));color:var(--soft);font-size:10px}.scope{color:var(--ink);font-weight:600}.read-controls label{display:flex;align-items:center;gap:5px;white-space:nowrap}.read-controls input{accent-color:var(--accent)}.read-controls>div{display:flex;align-items:center;gap:5px;margin-left:auto}.read-controls button{display:grid;place-items:center;min-width:32px;height:30px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font-size:10px}:global(.spin){animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){:global(.spin){animation:none}}
@container(max-width:520px){.read-controls{padding:6px 10px;gap:6px;flex-wrap:wrap}.read-controls button{min-width:44px;height:44px}}
</style>
