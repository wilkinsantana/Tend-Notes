import { Marked, type Token } from 'marked';
import { isPersonalTemplate } from './personalTemplates';

export interface MarkdownTask {
  key: string;
  offset: number;
  line: number;
  text: string;
  checked: boolean;
}

interface Candidate extends MarkdownTask {
  labelOffset: number;
}

const parser = new Marked({ gfm: true, breaks: false, async: false });

// Marked deliberately does not expose source positions. Add a unique plain-text
// marker after each possible checkbox, then retain only markers that Marked puts
// immediately after a semantic checkbox token. Code and raw HTML never produce
// that token, including fenced/indented code and HTML comments.
function semanticCandidateIds(content: string, candidates: Candidate[]): Set<number> {
  let nonce = 0;
  let prefix = '';
  do prefix = `TENDNOTESTASKSENTINEL${nonce++}Q`;
  while (content.includes(prefix));

  const fragments: string[] = [];
  let cursor = 0;
  for (let index = 0; index < candidates.length; index++) {
    const offset = candidates[index].labelOffset;
    fragments.push(content.slice(cursor, offset), `${prefix}${index}Q`);
    cursor = offset;
  }
  fragments.push(content.slice(cursor));

  const ids = new Set<number>();
  const marker = new RegExp(`^${prefix}(\\d+)Q`);
  const walk = (tokens: Token[]) => {
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token.type === 'checkbox') {
        const match = marker.exec(tokens[index + 1]?.raw ?? '');
        if (match) ids.add(Number(match[1]));
      }
      if (token.type === 'list') {
        for (const item of token.items) walk(item.tokens);
      } else if ('tokens' in token && Array.isArray(token.tokens)) {
        walk(token.tokens);
      }
    }
  };
  walk(parser.lexer(fragments.join('')));
  return ids;
}

function candidates(content: string): Candidate[] {
  const found: Candidate[] = [];
  // This is intentionally broader than CommonMark indentation rules. Marked is
  // the semantic filter; the expression only locates source characters that
  // could be a list checkbox, including nested lists and quoted lists.
  const possibleTask = /((?:[-+*]|\d{1,9}[.)])[ \t]+\[)([ xX])\]([ \t]+)(?=\S)/g;
  let line = 1;
  let lineOffset = 0;

  while (lineOffset <= content.length) {
    const newline = content.indexOf('\n', lineOffset);
    const end = newline < 0 ? content.length : newline;
    const physicalLine = content.slice(lineOffset, end);
    const sourceLine = physicalLine.endsWith('\r') ? physicalLine.slice(0, -1) : physicalLine;
    for (const match of sourceLine.matchAll(possibleTask)) {
      const matchOffset = match.index;
      const offset = lineOffset + matchOffset + match[1].length;
      const labelOffset = lineOffset + matchOffset + match[0].length;
      found.push({
        key: `${line}:${offset}`,
        offset,
        line,
        text: sourceLine.slice(matchOffset + match[0].length).trim(),
        checked: match[2] !== ' ',
        labelOffset,
      });
    }
    if (newline < 0) break;
    lineOffset = newline + 1;
    line++;
  }
  return found;
}

export function extractTasks(content: string): MarkdownTask[] {
  // Template checkboxes describe future copies, not active commitments.
  if (isPersonalTemplate(content)) return [];
  const possible = candidates(content);
  if (possible.length === 0) return [];
  const semantic = semanticCandidateIds(content, possible);
  return possible
    .filter((_, index) => semantic.has(index))
    .map(({ labelOffset: _labelOffset, ...task }) => task);
}

export function setTaskChecked(content: string, task: MarkdownTask, checked: boolean): string {
  const current = candidates(content).find((candidate) => candidate.offset === task.offset);
  if (!current
    || current.key !== task.key
    || current.line !== task.line
    || current.text !== task.text
    || current.checked !== task.checked
    || !semanticCandidateIds(content, [current]).has(0)) {
    throw new Error('This task no longer matches the open note. Refresh it and try again.');
  }
  if (current.checked === checked) return content;
  return content.slice(0, current.offset) + (checked ? 'x' : ' ') + content.slice(current.offset + 1);
}
