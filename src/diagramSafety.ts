// Diagram CSS and links come from whoever wrote the note, including a shared or imported note. Mermaid and DOMPurify
// leave `url(https://…)` in <style> text and in style or presentation attributes, so merely opening a note would make the
// owner's browser fetch an address the author chose. Only same-document fragments (`url(#arrow)`) may stay.

/** Decode CSS escapes (`\75\72\6c(` is `url(`) so the checks below see what the browser sees. */
export function decodeCssEscapes(css: string): string {
  return css.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|(\r\n|[\n\r\f])|([\s\S]))/g, (_all, hex?: string, newline?: string, other?: string) => {
    if (newline) return '';
    if (other !== undefined) return other;
    const code = parseInt(hex!, 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '�' : String.fromCodePoint(code);
  });
}

const importRule = /@import\b[^;{}]*;?/gi;
const urlCall = /url\(\s*("[^"]*"?|'[^']*'?|[^)]*)\)?/gi;
const fetchingFunction = /(?<![\w-])(?:-webkit-|-moz-)?(?:image-set|cross-fade|image|src)\s*\(/gi;

/**
 * Neutralise every CSS construct that fetches a resource other than a fragment of this document. Text that needs no
 * change is returned untouched; text that does is returned decoded, so an escaped spelling cannot survive.
 */
export function scrubCss(css: string): string {
  if (!/[(\\@]/.test(css)) return css;
  const decoded = decodeCssEscapes(css);
  const scrubbed = decoded
    .replace(importRule, '')
    .replace(urlCall, (call, target: string) => {
      const value = target.replace(/^["']|["']$/g, '').trim();
      return value.startsWith('#') ? call : 'none';
    })
    .replace(fetchingFunction, 'none(');
  return scrubbed === decoded ? css : scrubbed;
}

/** Only a fragment of this very document may be linked; anything else could fetch or navigate. */
export const isFragmentReference = (value: string) => value.replace(/^[\s\u0000-\u001f]+/, '').startsWith('#');

/** Plain-note budget so a note full of large diagrams cannot keep the panel drawing forever. */
export const DIAGRAM_CHAR_BUDGET = 60000;
export const DIAGRAM_BUDGET_MESSAGE = 'This note has too many diagrams to draw at once.';
/** True for each source that still fits once the sources before it have used their share of the budget. */
export function withinDiagramBudget(sources: string[], budget = DIAGRAM_CHAR_BUDGET): boolean[] {
  let used = 0;
  return sources.map(source => (used += source.length) <= budget);
}

// ---- The source itself -------------------------------------------------------------------------------------------
// Mermaid draws into the live page before anything here can sanitise its output, so a stylesheet, image or font named
// by the note is fetched during the render itself. The note's own configuration is therefore reduced before Mermaid
// reads it: `%%{init}%%` directives and front matter keep only plain settings (numbers, flags and short words), and
// node images (`A@{ img: "https://…" }`) are dropped. Tend's theme is applied by the extension, never by the note.

const plainWord = /^[\w .,#%-]{0,80}$/;
const plainKey = /^[A-Za-z_][\w-]{0,40}$/;
function plainSetting(value: unknown, depth = 0): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return plainWord.test(value) ? value : undefined;
  if (depth > 6 || value === null || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) return value.slice(0, 50).map(item => plainSetting(item, depth + 1)).filter(item => item !== undefined);
  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!plainKey.test(key) || key.startsWith('__') || key === 'themeCSS') continue;
    const kept = plainSetting(item, depth + 1);
    if (kept !== undefined) clean[key] = kept;
  }
  return clean;
}
// The same pattern Mermaid uses to find directives, so nothing it would read escapes this pass.
const directive = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
function plainDirectives(text: string): string {
  // Replacements keep the original line count so a Mermaid error still names the line the writer sees.
  return text.replace(directive, (all, keyed?: string, bare?: string, word?: string, body?: string) => {
    const lines = '\n'.repeat((all.match(/\n/g) ?? []).length);
    const type = (keyed ?? bare ?? '').toLowerCase();
    if (!keyed && type === 'wrap' && !word && !body?.trim()) return '%%{wrap}%%' + lines;
    if (type !== 'init' && type !== 'initialize') return lines;
    try {
      const settings = plainSetting(JSON.parse((body ?? '').trim().replace(/'/g, '"')));
      return (settings && typeof settings === 'object' && !Array.isArray(settings) && Object.keys(settings).length ? `%%{init: ${JSON.stringify(settings)}}%%` : '') + lines;
    } catch { return lines; }
  });
}
function plainFrontMatter(text: string): string {
  const lines = text.split(/\r?\n/);
  let open = 0;
  while (open < lines.length && !lines[open].trim()) open++;
  if (lines[open]?.trim() !== '---') return text;
  const close = lines.findIndex((line, index) => index > open && line.trim() === '---');
  if (close < 0) return text;
  const title = lines.slice(open + 1, close).find(line => /^title:\s*[\w .,#%-]{1,80}\s*$/i.test(line));
  const head = title ? ['---', title.trim(), '---'] : [];
  while (head.length < close + 1) head.push('');
  return head.concat(lines.slice(close + 1).map(line => line.trim() === '---' ? '' : line)).join('\n');
}
const nodeImage = /(^|[{,\s])["']?img["']?\s*:\s*(?:"[^"]*"|'[^']*'|[^,}\n]*)\s*,?/gi;
const plainNodeSettings = (text: string) => text.replace(/@{[\s\S]*?}/g, block => block.replace(nodeImage, '$1'));

/** The Mermaid source with every setting that could name an outside resource removed. Pure, so it can be tested without Mermaid. */
export const safeDiagramSource = (source: string): string => plainNodeSettings(plainDirectives(plainFrontMatter(source)));
