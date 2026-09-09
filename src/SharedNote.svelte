<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { Bold, Code, Download, Eye, FileText, Heading2, ImagePlus, Italic, List, ListTodo, Mic, PenLine, Quote, Redo2, Table2, Type, Undo2, Users } from 'lucide-svelte';
  import Preview from './Preview.svelte';
  import ResponsiveToolbar from './ResponsiveToolbar.svelte';
  import WritingEditor from './WritingEditor.svelte';
  import MediaDialog from './MediaDialog.svelte';
  import { WritingSurface } from './proseWritingSurface';
  import type { Documents } from './host';
  import type { SharedHost, SharedState } from './sharedHost';
  import { editMarkdown } from './formatting';

  let { host }: {host: SharedHost} = $props();
  let shared = $state<SharedState>({name:'Shared note',content:'',documentId:'',permission:'view',allowAttachments:false,status:'reconnecting',error:null,canUndo:false,canRedo:false});
  let body = $state('');
  let mode = $state<'view'|'source'|'rich'>('view');
  let source = $state<HTMLTextAreaElement | undefined>();
  let surface = $state<WritingSurface | undefined>();
  let mediaKind = $state<'image'|'audio'|'document'|null>(null);
  let selection = $state({start:0,end:0});
  let pending: SharedState | null = null;
  let composing = false;
  let attempted = $state<string | null>(null);
  let rejected = false;
  let localError = $state('');
  let alive = true;

  const editable = $derived(shared.permission === 'edit' && shared.status !== 'blocked');
  const statusLabel = $derived(shared.status === 'saved' ? 'Saved' : shared.status === 'saving' ? 'Saving…' : shared.status === 'reconnecting' ? 'Reconnecting…' : 'Editing blocked');
  const participantNames = $derived(shared.participants?.map(participant => participant.name).join(', ') ?? 'No other participants');
  const documents: Documents = {
    version: 1,
    attachments: {
      upload: (_id, file) => host.upload(file),
      read: (_id, path) => host.readAttachment(path),
    },
  } as Documents;

  function apply(next: SharedState) {
    shared = next;
    if (rejected && attempted !== null) {
      localError = next.error || 'Your edit was not accepted. Download this local copy or reload the shared version.';
      return;
    }
    if (attempted !== null && next.content === attempted) attempted = null;
    if (next.error) localError = next.error;
    else localError = '';
    if (next.content !== body) body = next.content;
    if (next.selection && !rejected) {
      const mapped=next.selection, expected=body;
      selection=mapped;
      void tick().then(()=>{if(alive && body===expected){source?.setSelectionRange(mapped.start,mapped.end);if(surface){surface.setBody(body,mapped);surface.select(mapped.start,mapped.end);}}});
    }
  }
  let receiveSequence = 0;
  $effect(()=>{
    const mapped=shared.selection, editor=surface, text=body;
    if(mapped && editor && !rejected && text===shared.content){editor.setBody(text,mapped);editor.select(mapped.start,mapped.end);}
  });
  function receive(next: SharedState) {
    receiveSequence++;
    if (composing) { pending = next; return; }
    apply(next);
  }
  function change(next: string) {
    if (!editable || next === body) return;
    const before = body;
    body = next;
    attempted = next;
    localError = ''; rejected = false;
    try { host.edit(before, next); }
    catch (error) { rejected=true; localError = error instanceof Error ? error.message : 'Your edit was not accepted. Download this local copy before leaving.'; }
  }
  function input(event: Event) {
    const field = event.currentTarget as HTMLTextAreaElement;
    selection = {start:field.selectionStart,end:field.selectionEnd};
    change(field.value);
    reportSelection(selection);
  }
  function reportSelection(next = selection) { host.presence?.(next.start,next.end); }
  function observeRich(node: HTMLElement) {
    const report = () => reportSelection(surface?.selection);
    node.addEventListener('click',report); node.addEventListener('keyup',report);
    return {destroy(){node.removeEventListener('click',report);node.removeEventListener('keyup',report);}};
  }
  function beginComposition() { if (!composing) { composing = true; host.beginComposition(); } }
  function endComposition() {
    if (!composing) return;
    const deferred=pending, sequence=receiveSequence;
    pending=null; composing = false; host.endComposition();
    if (deferred && receiveSequence === sequence) apply(deferred);
  }
  function insert(markdown: string) {
    if (!editable) return;
    if (mode === 'rich' && surface) { mediaKind = null; surface.insertMarkdown(markdown); return; }
    const insertText = `\n${markdown}\n`;
    const next = body.slice(0,selection.start) + insertText + body.slice(selection.end);
    selection = {start:selection.start + insertText.length,end:selection.start + insertText.length};
    change(next); mediaKind = null;
    void tick().then(() => source?.setSelectionRange(selection.start,selection.end));
  }
  function downloadMarkdown() {
    const link=document.createElement('a'); const url=URL.createObjectURL(new Blob([body],{type:'text/markdown;charset=utf-8'}));
    link.href=url; link.download=shared.name || 'shared-note.md'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  function reloadShared() { rejected=false; attempted=null; localError=''; body=shared.content; }
  function format(before: string, after = '', prefix = false, checklist = false) {
    if (!editable) return;
    if (mode === 'rich' && surface) {
      if (checklist) surface.checklist(); else surface.format(before,after,prefix);
      reportSelection(surface.selection); return;
    }
    const result=editMarkdown(body,selection.start,selection.end,before,after,prefix);
    selection={start:result.start,end:result.end}; change(result.content);
    void tick().then(()=>{source?.setSelectionRange(selection.start,selection.end);reportSelection();});
  }
  function undo() { if (editable) host.undo(); }
  function redo() { if (editable) host.redo(); }
  function historyKey(event: KeyboardEvent) {
    if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') { event.preventDefault(); if (key === 'y' || event.shiftKey) redo(); else undo(); }
  }
  function historyInput(event: InputEvent) {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault(); if (event.inputType === 'historyUndo') undo(); else redo();
    }
  }
  function attach(kind: 'image'|'audio'|'document') {
    if (!editable || !shared.allowAttachments) return;
    if (mode === 'view') mode='source';
    selection = mode === 'rich' && surface ? surface.selection : {start:source?.selectionStart ?? body.length,end:source?.selectionEnd ?? body.length};
    mediaKind=kind;
  }
  onMount(() => {
    const unsubscribe=host.subscribe(next=>{if(alive)receive(next);});
    return () => unsubscribe();
  });
  onDestroy(() => { alive=false; });
  $effect(() => { surface?.setCollaborators(shared.participants ?? []); });
</script>

<section class="shared-note" oncompositionstart={beginComposition} oncompositionend={endComposition}>
  <header>
    <div class="identity"><span>Tend Notes</span><h1>{shared.name}</h1></div>
    <div class="presence" aria-label={`Participants: ${participantNames}`} title={participantNames}>{#if shared.participants?.length}<Users size={15}/><span>{shared.participants.length}</span>{/if}</div>
    <span class:blocked={shared.status === 'blocked'} class="shared-save-status" role="status">{statusLabel}</span>
  </header>
  <div class="controls" role="group" aria-label="Shared note controls">
    <button class="icon" aria-label="Undo" title="Undo" disabled={!editable || !shared.canUndo} onclick={undo}><Undo2 size={17}/></button>
    <button class="icon" aria-label="Redo" title="Redo" disabled={!editable || !shared.canRedo} onclick={redo}><Redo2 size={17}/></button>
    <button class:active={mode === 'view'} class="icon" aria-label="Preview" title="Preview" onclick={() => mode='view'}><Eye size={17}/></button>
    <button class:active={mode === 'source'} class="icon" aria-label="Edit Markdown" title="Edit Markdown" disabled={!editable} onclick={() => mode='source'}><PenLine size={17}/></button>
    <button class:active={mode === 'rich'} class="icon" aria-label="Rich text writing" title="Rich text writing" disabled={!editable} onclick={() => mode='rich'}><Type size={17}/></button>
    <button class="icon" aria-label="Download Markdown" title="Download Markdown" onclick={downloadMarkdown}><Download size={17}/></button>
  </div>
  {#snippet toolBold()}<button class="icon" aria-label="Bold" title="Bold" onclick={() => format('**','**')}><Bold size={17}/></button>{/snippet}
  {#snippet toolItalic()}<button class="icon" aria-label="Italic" title="Italic" onclick={() => format('*','*')}><Italic size={17}/></button>{/snippet}
  {#snippet toolHeading()}<button class="icon" aria-label="Heading" title="Heading" onclick={() => format('## ','',true)}><Heading2 size={17}/></button>{/snippet}
  {#snippet toolList()}<button class="icon" aria-label="Bulleted list" title="Bulleted list" onclick={() => format('- ','',true)}><List size={17}/></button>{/snippet}
  {#snippet toolChecklist()}<button class="icon" aria-label="Checklist" title="Checklist" onclick={() => format('- [ ] ','',true,true)}><ListTodo size={17}/></button>{/snippet}
  {#snippet toolQuote()}<button class="icon" aria-label="Block quote" title="Block quote" onclick={() => format('> ','',true)}><Quote size={17}/></button>{/snippet}
  {#snippet toolCode()}<button class="icon" aria-label="Code block" title="Code block" onclick={() => format('\n```text\n','\n```\n')}><Code size={17}/></button>{/snippet}
  {#snippet toolTable()}<button class="icon" aria-label="Insert table" title="Insert table" onclick={() => format('\n| Column | Column |\n| --- | --- |\n| ',' |  |\n')}><Table2 size={17}/></button>{/snippet}
  {#snippet toolImage()}<button class="icon" aria-label="Attach image" title="Attach image" onclick={() => attach('image')}><ImagePlus size={17}/></button>{/snippet}
  {#snippet toolAudio()}<button class="icon" aria-label="Attach audio" title="Attach audio" onclick={() => attach('audio')}><Mic size={17}/></button>{/snippet}
  {#snippet toolPdf()}<button class="icon" aria-label="Attach PDF" title="Attach PDF" onclick={() => attach('document')}><FileText size={17}/></button>{/snippet}
  {#if mode !== 'view' && editable}<div class="formatting"><ResponsiveToolbar tools={[toolBold,toolItalic,toolHeading,toolList,toolChecklist,toolQuote,toolCode,toolTable,...(shared.allowAttachments?[toolImage,toolAudio,toolPdf]:[])]}/></div>{/if}
  {#if localError}<div class="notice" role="alert">{localError}<button onclick={downloadMarkdown}>Download local copy</button><button onclick={reloadShared}>Use shared version</button></div>{/if}
  <main>
    {#if mode === 'view'}<div class="preview"><Preview content={body} {documents} noteId={shared.documentId}/></div>
    {:else if mode === 'source'}<textarea bind:this={source} aria-label="Shared note Markdown" value={body} readonly={!editable} onkeydown={historyKey} onbeforeinput={historyInput} oninput={input} onselect={event => { const field=event.currentTarget; selection={start:field.selectionStart,end:field.selectionEnd};reportSelection(selection); }} spellcheck="true"></textarea>
    {:else}<div class="rich-presence" use:observeRich><WritingEditor Surface={WritingSurface} {body} readOnly={!editable} matches={[]} activeStart={-1} bind:surface onchange={writingChange => { selection=writingChange.after; change(writingChange.body); reportSelection(selection); }} onundo={undo} onredo={redo}/></div>{/if}
  </main>
  {#if mediaKind}<MediaDialog kind={mediaKind} {documents} noteId={shared.documentId} insert={insert} close={() => mediaKind=null}/>{/if}
</section>

<style>
  .shared-note{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--paper,#15201c);color:var(--ink,#e6efea);font:14px/1.6 var(--font-sans,system-ui,sans-serif)}header{min-height:52px;padding:6px 12px;border-bottom:1px solid var(--line,#304239);display:flex;align-items:center;gap:8px}.identity{min-width:0;flex:1;overflow:hidden}.identity span{font-size:10px;color:var(--soft,#a4b6ae);display:block}.identity h1{font-size:15px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0}.shared-save-status,.presence{font-size:11px;color:var(--soft,#a4b6ae);display:inline-flex;gap:4px;align-items:center}.shared-save-status{flex-shrink:0;white-space:nowrap}.blocked{color:#d97872}.controls{display:flex;align-items:center;gap:2px;padding:4px 8px;border-bottom:1px solid var(--line,#304239);flex-shrink:0}.icon{width:44px;height:44px;display:grid;place-items:center;flex:0 0 44px;border:0;border-radius:7px;background:transparent;color:var(--ink,#e6efea)}.icon.active{background:var(--wash,#1d2923);color:var(--accent,#6fbea0)}.icon:disabled{opacity:.45}.formatting{padding:3px 8px;border-bottom:1px solid var(--line,#304239);flex-shrink:0}.formatting :global(.toolbar){min-height:44px}.formatting :global(.icon){width:44px;height:44px}.notice{margin:10px 14px 0;padding:10px 12px;border:1px solid color-mix(in srgb,#d97872 45%,var(--line,#304239));border-radius:8px;color:#d97872;font-size:12px}.notice button{margin-left:10px;background:none;border:0;color:var(--accent,#6fbea0);text-decoration:underline;font:inherit}main{position:relative;min-height:0;flex:1;display:flex;overflow:hidden}.preview,textarea,.rich-presence{flex:1;min-width:0;overflow:auto}.preview{padding:22px 28px;overflow-wrap:anywhere}.preview :global(.rendered-markdown){min-height:100%}textarea{resize:none;border:0;outline:0;background:transparent;color:var(--ink,#e6efea);padding:22px 28px;font:16px/1.85 var(--font-mono,ui-monospace,monospace)}textarea:read-only{opacity:.85}@container(max-width:620px){header{padding:5px 8px}.controls,.formatting{padding:3px 6px}.preview,textarea{padding:18px}.icon{width:44px;height:44px}}:is(button,textarea):focus-visible{outline:2px solid var(--accent,#6fbea0);outline-offset:2px}
</style>
