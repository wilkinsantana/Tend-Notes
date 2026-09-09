import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: true, linkify: false });

/** Read document structure, never rendered DOM, remote media or hidden metadata. */
export function markdownToSpeech(markdown: string): string {
  const body = markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const tokens = parser.parse(body, {});
  let output = '';
  for (const token of tokens) {
    if (token.type === 'inline') {
      for (const child of token.children ?? []) {
        if (child.type === 'text' || child.type === 'image') output += child.content;
        else if (child.type === 'softbreak' || child.type === 'hardbreak') output += ' ';
        // Inline code and HTML are deliberately not read aloud.
      }
    } else if (token.type === 'td_close' || token.type === 'th_close') output += '; ';
    else if (['paragraph_close', 'heading_close', 'tr_close', 'list_item_close', 'blockquote_close'].includes(token.type)) output += '\n';
  }
  return output
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, '')
    .replace(/^\s*\[[ xX]\]\s*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/;\s*\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
