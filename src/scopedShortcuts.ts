/** Local event routing: attach to a component root, never window/document. */
export type ScopedShortcut = {
  key: string; shift?: boolean; alt?: boolean; enabled?: boolean; run: () => void;
};
export function runScopedShortcut(event: KeyboardEvent, bindings: readonly ScopedShortcut[]): boolean {
  const root = event.currentTarget;
  const target = event.target;
  if (!(root instanceof HTMLElement) || !(target instanceof HTMLElement) || !root.contains(target)
    || target.closest('[data-shortcut-scope]') !== root || target.closest('[role="dialog"], [role="alertdialog"]')
    || event.isComposing || event.keyCode === 229 || event.getModifierState('AltGraph')
    || (!event.ctrlKey && !event.metaKey) || (event.ctrlKey && event.metaKey)) return false;
  const key = /^Digit\d$/.test(event.code) ? event.code.slice(5) : event.key.toLowerCase();
  const binding = bindings.find(item => item.enabled !== false && item.key === key
    && !!item.shift === event.shiftKey && !!item.alt === event.altKey);
  if (!binding) return false;
  // An editor may have already executed its own equivalent keymap command.
  event.stopPropagation();
  if (event.defaultPrevented) return true;
  event.preventDefault();
  if (!event.repeat) binding.run();
  return true;
}
