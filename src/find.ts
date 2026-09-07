export interface TextMatch { start: number; end: number }
export const MAX_FIND_MATCHES = 10_000;

/** Literal Unicode-aware matching, with offsets in the original textarea text. */
export function findInNote(body: string, query: string, matchCase = false): { matches: TextMatch[]; truncated: boolean } {
  if (!query || query.length > 256) return { matches: [], truncated: false };
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(literal, matchCase ? 'gu' : 'giu');
  const matches: TextMatch[] = [];
  for (const match of body.matchAll(expression)) {
    if (matches.length === MAX_FIND_MATCHES) return { matches, truncated: true };
    matches.push({ start: match.index, end: match.index + match[0].length });
  }
  return { matches, truncated: false };
}
