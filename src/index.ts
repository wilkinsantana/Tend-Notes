import { mount, unmount } from 'svelte';
import App from './App.svelte';
import type { Host } from './host';
export function activate(host: Host) {
  return { mount(container: HTMLElement) {
    const instance = mount(App, { target: container, props: { host } });
    const observer = new ResizeObserver(([entry]) => {
      container.querySelector('.notes-app')?.classList.toggle('narrow', entry.contentRect.width <= 680);
    });
    observer.observe(container);
    return { async unmount() { observer.disconnect(); await instance.flush?.(); await unmount(instance); } };
  } };
}
