/** Keep boundary whitespace outside inline delimiters; prefix every selected line. */
export function editMarkdown(body: string, start: number, end: number, before: string, after = '', prefix = false) {
  if (prefix) {
    start = body.lastIndexOf('\n', start - 1) + 1;
    const selected = body.slice(start, end);
    const content = selected.split('\n').map((line, i) => (before === '1. ' ? `${i + 1}. ` : before) + line).join('\n');
    return {content: body.slice(0, start) + content + body.slice(end), start: start + before.length, end: start + content.length};
  }
  let selected = body.slice(start, end);
  if (after && !before.includes('\n')) {
    const leading = selected.match(/^\s*/)?.[0].length ?? 0;
    const trailing = selected.trim() ? selected.match(/\s*$/)?.[0].length ?? 0 : 0;
    start += leading; end -= trailing; selected = body.slice(start, end);
  }
  return {content: body.slice(0, start) + before + selected + after + body.slice(end), start: start + before.length, end: end + before.length};
}
