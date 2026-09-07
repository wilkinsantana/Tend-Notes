<script lang="ts">
  import { X, Sigma } from 'lucide-svelte';
  import { renderFormula } from './math';
  let { initial = '', oninsert, onclose }: {initial?: string; oninsert:(value:string)=>void; onclose:()=>void} = $props();
  let source = $state(initial || 'E = mc^2');
  let display = $state(true);
  const result = $derived.by(() => {
    try { if(!display && /[\r\n]/.test(source.trim())) throw new Error('Use display mode for a multiline formula.'); return {html: renderFormula(source, display), error:''}; }
    catch(e) { return {html:'', error:e instanceof Error ? e.message : 'Check your formula.'}; }
  });
  const examples = [{name:'Fraction',value:'\\frac{a}{b}'},{name:'Square root',value:'\\sqrt{x}'},{name:'Sum',value:'\\sum_{i=1}^{n} i'},{name:'Integral',value:'\\int_0^1 x^2\\,dx'},{name:'Matrix',value:'\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'}];
</script>
<div class="formula-backdrop" role="presentation">
  <section role="dialog" aria-modal="true" aria-label="Insert formula" tabindex="-1" onkeydown={e => {if(e.key==='Escape'){e.preventDefault();onclose();} if(e.key==='Tab'){ const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input')]; const index=nodes.indexOf(document.activeElement as HTMLElement); if(e.shiftKey && index<=0){e.preventDefault();nodes.at(-1)?.focus();} else if(!e.shiftKey && index===nodes.length-1){e.preventDefault();nodes[0]?.focus();} }}}>
    <header><h2><Sigma size={20}/> Formula</h2><button aria-label="Close formula" onclick={onclose}><X size={18}/></button></header>
    <label for="formula-source">LaTeX equation</label>
    <textarea id="formula-source" bind:value={source} maxlength="8192" rows="4" use:focus></textarea>
    <div class="examples">{#each examples as example}<button onclick={() => source=example.value}>{example.name}</button>{/each}</div>
    <label class="display"><input type="checkbox" bind:checked={display}/> Display on its own line</label>
    <div class="formula-preview" aria-label="Formula preview">{#if result.error}<p role="status">{result.error}</p>{:else}{@html result.html}{/if}</div>
    <footer><small>Saved as portable Markdown and LaTeX.</small><button class="insert" disabled={!source.trim() || !!result.error} onclick={() => oninsert(display ? `\n\n$$\n${source.trim()}\n$$\n\n` : `$${source.trim()}$`)}>Insert formula</button></footer>
  </section>
</div>
<script lang="ts" context="module">
  function focus(node:HTMLTextAreaElement){node.focus();node.select();}
</script>
<style>
  .formula-backdrop{position:absolute;inset:0;z-index:90;background:#0006;display:grid;place-items:center;padding:16px}
  section{width:min(520px,100%);max-height:90%;overflow:auto;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:20px;box-shadow:0 20px 70px #0005}
  header,footer{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{display:flex;gap:8px;align-items:center;font-size:17px;margin:0 0 16px}label{display:block;font-size:13px;margin:12px 0 8px}textarea{box-sizing:border-box;width:100%;background:var(--wash);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:12px;font-family:monospace;resize:vertical}.examples{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}button{background:var(--wash);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:7px 10px;cursor:pointer}.display{display:flex;gap:8px;align-items:center}.formula-preview{padding:20px;overflow:auto;min-height:60px;background:var(--wash);border-radius:8px;margin:16px 0}.formula-preview p{color:var(--soft);font-size:12px;overflow-wrap:anywhere}small{color:var(--soft);font-size:11px}.insert{background:var(--accent);color:var(--accent-ink,#06251b)}button:disabled{opacity:.45;cursor:default}button:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
