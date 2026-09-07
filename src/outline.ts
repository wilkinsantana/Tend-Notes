import { Marked } from 'marked';

export interface OutlineHeading { level: number; label: string; offset: number }
type Candidate = OutlineHeading;

const blockTag = /^(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|ol|p|pre|script|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|>|\/)/i;

const inlineLabel = (value: string) => value
  .replace(/!?(?:\[([^\]]*)\]\([^)]*\)|\[([^\]]*)\]\[[^\]]*\])/g, (_, first, second) => first ?? second ?? '')
  .replace(/[`*_~]/g, '')
  .replace(/<[^>]*>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function quoteContent(line: string) {
  let value = line;
  while (true) {
    const quote = /^(?: {0,3})>[ \t]?/.exec(value);
    if (!quote) return value;
    value = value.slice(quote[0].length);
  }
}

function listContent(line: string) {
  let value = line;
  while (true) {
    const list = /^(?: {0,3})(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(value);
    if (!list) return value;
    value = value.slice(list[0].length);
  }
}

function sourceCandidates(markdown: string): Candidate[] {
  const candidates: Candidate[] = [];
  let previous: { text: string; offset: number; indented: boolean } | null = null;
  let fenced: { marker: '`' | '~'; width: number } | null = null;
  let html: 'comment' | 'block' | null = null;
  let listContinuation = 0;
  for (const match of markdown.matchAll(/.*(?:\r\n|\n|\r|$)/g)) {
    if (!match[0]) continue;
    const offset = match.index!;
    const original = match[0].replace(/\r\n|\n|\r$/, '');
    const quoted = quoteContent(original);
    const listed = /^( *)(?:[-+*]|\d{1,9}[.)])([ \t]+)/.exec(quoted);
    const continuation = !listed && listContinuation > 0 && new RegExp(`^ {${listContinuation},}`).test(quoted);
    const line = listed ? listContent(quoted) : continuation ? quoted.slice(listContinuation) : quoted;
    if (fenced) {
      const closing = new RegExp(`^(?: {0,3})${fenced.marker}{${fenced.width},}[ \\t]*$`).test(line);
      if (closing) fenced = null;
      previous = null;
      continue;
    }
    const fence = /^(?: {0,3})(`{3,}|~{3,})/.exec(line);
    if (fence) { fenced = { marker: fence[1][0] as '`' | '~', width: fence[1].length }; previous = null; continue; }
    if (html) {
      if ((html === 'comment' && line.includes('-->')) || (html === 'block' && !line.trim())) html = null;
      previous = null;
      continue;
    }
    if (/^\s*<!--/.test(line)) { if (!line.includes('-->')) html = 'comment'; previous = null; continue; }
    if (/^\s*<\/?[A-Za-z][^>]*>/.test(line) && blockTag.test(line.trimStart().slice(1))) { html = 'block'; previous = null; continue; }
    if (listed) listContinuation = listed[0].length;
    else if (!line.trim()) { previous = null; continue; }
    else if (!continuation) listContinuation = 0;
    // Four source spaces are code only outside a retained list continuation.
    const indented = !continuation && /^(?: {4}|\t)/.test(quoted);
    if (indented) { previous = null; continue; }
    const setext = /^(?: {0,3})(=+|-+)\s*$/.exec(line);
    if (setext && previous && !previous.indented && previous.text.trim()) {
      const label = inlineLabel(previous.text);
      if (label) candidates.push({ level: setext[1][0] === '=' ? 1 : 2, label, offset: previous.offset });
      previous = null;
      continue;
    }
    const atx = /^(?: {0,3})(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line);
    if (atx) {
      const label = inlineLabel(atx[2].replace(/[ \t]+#+[ \t]*$/, ''));
      if (label) candidates.push({ level: atx[1].length, label, offset });
      previous = null;
      continue;
    }
    previous = previous ? { text: previous.text + '\n' + line, offset: previous.offset, indented } : { text: line, offset, indented };
  }
  return candidates;
}
function renderedHeadings(markdown: string) {
  const parser = new Marked({ gfm: true, breaks: false, async: false });
  const headings: Array<{ level: number; label: string }> = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const token = value as Record<string, unknown>;
    if (token.type === 'heading' && typeof token.depth === 'number' && typeof token.text === 'string') {
      const label = inlineLabel(token.text);
      if (label) headings.push({ level: token.depth, label });
      return;
    }
    if (Array.isArray(token.tokens)) visit(token.tokens);
    if (Array.isArray(token.items)) visit(token.items);
  };
  visit(parser.lexer(markdown));
  return headings;
}

/** Uses Marked as the rendered-heading authority, then maps headings back to original UTF-16 source offsets. */
export function noteOutline(markdown: string): OutlineHeading[] {
  const candidates = sourceCandidates(markdown);
  let cursor = 0;
  return renderedHeadings(markdown).flatMap(heading => {
    for (let probe = cursor; probe < candidates.length; probe += 1) {
      const candidate = candidates[probe];
      if (candidate.level === heading.level && candidate.label === heading.label) {
        cursor = probe + 1;
        return [candidate];
      }
    }
    // Keep the next candidate available: an unmapable nested heading must not
    // consume later source offsets for otherwise valid rendered headings.
    return [];
  });
}
