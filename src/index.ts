import { mount, unmount } from 'svelte';
import App from './App.svelte';
import type { Host } from './host';
import type { SharedHost } from './sharedHost';
export function activate(host: Host) {
  return { mount(container: HTMLElement) {
    const instance = mount(App, { target: container, props: { host } });
    const newNote=()=>instance.newNote();
    container.addEventListener('tend-notes:new-note',newNote);
    container.dataset.notesHeaderAction='1';
    const observer = new ResizeObserver(([entry]) => {
      container.querySelector('.notes-app')?.classList.toggle('narrow', entry.contentRect.width <= 680);
    });
    observer.observe(container);
    return { async unmount() { observer.disconnect(); container.removeEventListener('tend-notes:new-note',newNote); delete container.dataset.notesHeaderAction; await instance.flush?.(); await unmount(instance); } };
  } };
}

export async function mountShared(host: SharedHost, container: HTMLElement) {
  if (host.version !== 1) throw new Error('Update Tend to open this shared note.');
  const {default: SharedNote} = await import('./SharedNote.svelte');
  const instance = mount(SharedNote, { target: container, props: { host } });
  return { async unmount() { await unmount(instance); } };
}
