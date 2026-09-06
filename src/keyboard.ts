/** A minimal text replacement; callers retain the textarea's native undo history. */
export interface MarkdownNewline { from: number; to: number; text: string }

function containerPrefix(line: string) {
  return line.match(/^[ \t]*(?:>[ \t]*)*/)?.[0] ?? '';
}

function fenceLine(line: string) {
  const rest = line.slice(containerPrefix(line).length)
    .replace(/^(?:[-+*]|\d{1,9}[.)])[ \t]+/, '');
  return rest.match(/^(`{3,}|~{3,})(.*)$/);
}

function insideFence(body: string, lineStart: number) {
  let fence: {char: string; length: number} | null = null;
  for (const line of body.slice(0, lineStart).split('\n')) {
    const match = fenceLine(line);
    if (!match) continue;
    if (fence) {
      if (match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim()) fence = null;
    } else if (match[1][0] !== '`' || !match[2].includes('`')) {
      fence = {char: match[1][0], length: match[1].length};
    }
  }
  return fence;
}

/** Continue lists, tasks, quotes and indentation. An empty marker exits its block. */
export function markdownNewline(body: string, start: number, end = start): MarkdownNewline | null {
  if (start < 0 || end < start || end > body.length || body.slice(start, end).includes('\n')) return null;
  const from = body.lastIndexOf('\n', start - 1) + 1;
  const next = body.indexOf('\n', end);
  const to = next < 0 ? body.length : next;
  const line = body.slice(from, to);
  const prefix = containerPrefix(line);
  if (start < from + prefix.length) return null;
  const rest = line.slice(prefix.length);
  const fence = insideFence(body, from);
  if (fence) {
    const closing = fenceLine(line);
    if (!(closing && closing[1][0] === fence.char && closing[1].length >= fence.length && !closing[2].trim())) {
      // Markdown-looking code is literal; only copy its whitespace/quote container.
      return prefix ? {from:start, to:end, text:'\n' + prefix} : null;
    }
  }
  const rule = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(rest);
  const marker = !rule && rest.match(/^([-+*]|\d{1,9}[.)])([ \t]+)(?:\[([ xX])\]([ \t]+|$))?/);
  if (marker && start >= from + prefix.length + marker[0].length) {
    if (start === end && !rest.slice(marker[0].length).trim()) {
      return {from, to, text:prefix + (from > 0 ? '\n' + prefix : '')};
    }
    const ordered = marker[1].match(/^(\d+)([.)])$/);
    const bullet = ordered ? `${Number(ordered[1]) + 1}${ordered[2]}` : marker[1];
    const task = marker[3] === undefined ? '' : '[ ]' + (marker[4] || ' ');
    return {from:start, to:end, text:'\n' + prefix + bullet + marker[2] + task};
  }
  if (prefix.includes('>') && !rest.trim() && start === end) {
    const parent = prefix.slice(0, prefix.lastIndexOf('>'));
    return {from, to, text:parent + (from > 0 ? '\n' + parent : '')};
  }
  return prefix ? {from:start, to:end, text:'\n' + prefix} : null;
}
