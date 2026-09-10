const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,tr';

function words(value: string): string[] {
  return value.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Map spoken paragraph positions to rendered blocks without storing note text in the DOM. */
export function mapSpeechParagraphs(root: HTMLElement, paragraphs: readonly string[]): Map<number, HTMLElement> {
  const candidates = [...root.querySelectorAll<HTMLElement>(BLOCKS)].filter(element => {
    if (element.matches('li') && element.querySelector(':scope > p, :scope li')) return false;
    return !element.closest('pre') && !!element.textContent?.trim();
  });
  const mapped = new Map<number, HTMLElement>();
  let cursor = 0;
  paragraphs.forEach((paragraph, index) => {
    const wanted = words(paragraph).join('\n');
    if (!wanted) return;
    for (let scan = cursor; scan < candidates.length; scan++) {
      const candidate = candidates[scan];
      if (words(candidate.textContent ?? '').join('\n') !== wanted) continue;
      mapped.set(index, candidate); cursor = scan + 1; break;
    }
  });
  return mapped;
}

export function clearSpeechParagraph(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-notes-reading]').forEach(element => element.removeAttribute('data-notes-reading'));
}

/** Highlight actual playback and scroll only when that block is outside the reading viewport. */
export function showSpeechParagraph(root: HTMLElement, paragraphs: readonly string[], activeIndex: number | null, follow: boolean): HTMLElement | null {
  clearSpeechParagraph(root);
  if (activeIndex === null) return null;
  const active = mapSpeechParagraphs(root, paragraphs).get(activeIndex) ?? null;
  if (!active) return null;
  active.dataset.notesReading = 'true';
  if (follow) {
    const viewport = root.getBoundingClientRect(), bounds = active.getBoundingClientRect();
    if (bounds.top < viewport.top || bounds.bottom > viewport.bottom) {
      const top = root.scrollTop + bounds.top - viewport.top - Math.max(0, (root.clientHeight - bounds.height) / 2);
      const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      root.scrollTo({top:Math.max(0, top), behavior:reduced ? 'auto' : 'smooth'});
    }
  }
  return active;
}
