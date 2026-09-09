<script lang="ts">
  import { renderDocument } from './markdown';
  import type { Documents } from './host';
  let {content, documents, noteId, onnotelink}: {content: string; documents: Documents; noteId: string; onnotelink?: (id:string)=>void} = $props();
  let element: HTMLDivElement;
  const rendered = $derived(renderDocument(content));
  $effect(() => {
    const result = rendered, id = noteId;
    // Wrap only tables; paragraphs retain the normal reading width.
    for(const table of element.querySelectorAll('table')) {
      if(table.parentElement?.classList.contains('table-scroll'))continue;
      const wrapper=document.createElement('div');wrapper.className='table-scroll';
      wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','Scrollable table');
      table.replaceWith(wrapper);wrapper.append(table);
    }
    let active = true;
    const urls: string[] = [];
    async function load(button: HTMLButtonElement) {
      const item = result.media[Number(button.dataset.notesMedia)];
      if (!item || button.disabled) return;
      button.disabled = true;
      try {
        let url = item.url;
        if (item.local) {
          if (!documents.attachments) throw new Error('Update Tend to open attachments.');
          const blob = await documents.attachments.read(id, item.url);
          if (!active) return;
          url = URL.createObjectURL(blob); urls.push(url);
        }
        if (!active) return;
        if (item.kind === 'image' && !item.local) {
          if (!documents.attachments?.externalImageUrl) throw new Error('Update Tend to view linked images here.');
          const frame = document.createElement('iframe'); frame.title = item.label;
          frame.setAttribute('sandbox',''); frame.referrerPolicy = 'no-referrer';
          frame.src = documents.attachments.externalImageUrl(item.url); button.replaceWith(frame);
        } else if (item.kind === 'youtube') {
          const frame = document.createElement('iframe');
          frame.title = item.label; frame.src = `https://www.youtube-nocookie.com/embed/${item.url}`;
          frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');
          frame.allow = 'encrypted-media; fullscreen; picture-in-picture'; frame.allowFullscreen = true;
          frame.referrerPolicy = 'strict-origin-when-cross-origin'; button.replaceWith(frame);
        } else if (item.kind === 'audio') {
          const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = url; audio.setAttribute('aria-label', item.label); button.replaceWith(audio);
        } else if (item.kind === 'document') {
          const download = document.createElement('a'); download.href = url; download.download = item.label || 'attachment.pdf'; download.textContent = `Download PDF: ${item.label}`; download.className = 'document-download'; button.replaceWith(download);
        } else {
          const img = document.createElement('img'); img.alt = item.label; img.referrerPolicy = 'no-referrer'; img.src = url;
          img.onerror = () => { if(active) { button.disabled=false; button.textContent='Image unavailable · retry'; img.replaceWith(button); } };
          button.replaceWith(img);
        }
      } catch(e) { if(active) { button.disabled=false; button.textContent=(e instanceof Error ? e.message : 'Attachment unavailable') + ' · retry'; } }
    }
    const click = (event: MouseEvent) => { const link=(event.target as Element).closest<HTMLButtonElement>('button[data-notes-link]'); if(link && element.contains(link)) { onnotelink?.(link.dataset.notesLink!); return; } const target = (event.target as Element).closest<HTMLButtonElement>('button[data-notes-media]'); if(target && element.contains(target)) void load(target); };
    element.addEventListener('click',click);
    // Local images and audio need no third-party consent. PDFs remain an explicit download.
    queueMicrotask(() => { if(active) for(const button of element.querySelectorAll<HTMLButtonElement>('button[data-notes-media]')) { const item=result.media[Number(button.dataset.notesMedia)]; if(item?.local && item.kind !== 'document') void load(button); } });
    return () => { active=false; element.removeEventListener('click',click); element.querySelectorAll('audio').forEach(a=>a.pause()); urls.forEach(url=>URL.revokeObjectURL(url)); };
  });
</script>
<div bind:this={element} class="rendered-markdown">{@html rendered.html}</div>
<style>
  .rendered-markdown :global(button[data-notes-link]){color:var(--accent);text-decoration:underline;cursor:pointer;background:none;border:0;font:inherit;padding:0}
  .rendered-markdown :global(strong){font-weight:700}.rendered-markdown :global(em){font-style:italic}.rendered-markdown :global(h1){font-size:1.8em}.rendered-markdown :global(h2){font-size:1.45em}.rendered-markdown :global(h3){font-size:1.2em}.rendered-markdown :global(ul){list-style:disc}.rendered-markdown :global(ol){list-style:decimal}.rendered-markdown :global(img){display:block;max-width:100%;height:auto;border-radius:8px;margin:12px 0}.rendered-markdown :global(audio){width:100%;margin:12px 0}.rendered-markdown :global(iframe){width:100%;aspect-ratio:16/9;border:0;border-radius:8px;margin:12px 0}.rendered-markdown :global(button[data-notes-media]),.rendered-markdown :global(.document-download){display:block;width:100%;padding:22px 16px;background:var(--wash);color:var(--accent);border:1px solid var(--line);border-radius:9px;text-align:left;margin:10px 0}.rendered-markdown :global(.document-download){box-sizing:border-box;text-decoration:none}.rendered-markdown :global(code){font-family:monospace;background:var(--wash);padding:2px 4px;border-radius:3px}.rendered-markdown :global(pre code){padding:0}.rendered-markdown :global(input){accent-color:var(--accent)}

  .rendered-markdown :global(.table-scroll){max-width:100%;overflow-x:auto;margin:12px 0;overscroll-behavior-x:contain}
  .rendered-markdown :global(.table-scroll table){width:max-content;min-width:100%;overflow-wrap:normal}
  .rendered-markdown :global(.table-scroll th),.rendered-markdown :global(.table-scroll td){min-width:120px;max-width:360px}
</style>
