/** Portable organization lives in one versioned Markdown comment, never a side database. */
export const COLORS = ['none', 'sage', 'sky', 'lavender', 'rose', 'amber'] as const;
export type Color = typeof COLORS[number];
export interface Organization { tags: string[]; color: Color; pinned: boolean }
export const empty = (): Organization => ({ tags: [], color: 'none', pinned: false });
const prefix = '<!-- tend-notes ';
export function normalizeTag(value: string): string {
  const tag = value.normalize('NFKC').trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-');
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._/-]{0,31}$/u.test(tag)) throw new Error('Use a short tag with letters, numbers, or / for related topics.');
  return tag;
}
export function unpack(content: string) {
  const end = content.indexOf('\n');
  const line = end < 0 ? content : content.slice(0, end).replace(/\r$/, '');
  const fallback = { body: content, organization: empty(), header: '', data: {} as Record<string, unknown> };
  if (!line.startsWith(prefix) || !line.endsWith(' -->') || new TextEncoder().encode(line).length > 4096) return fallback;
  try {
    const data = JSON.parse(line.slice(prefix.length, -4));
    if (!data || data.v !== 1 || !Array.isArray(data.tags) || data.tags.length > 12 || typeof data.pinned !== 'boolean' || !COLORS.includes(data.color)) return fallback;
    if (!data.tags.every((tag: unknown) => typeof tag === 'string' && normalizeTag(tag) === tag) || new Set(data.tags).size !== data.tags.length) return fallback;
    return { body: end < 0 ? '' : content.slice(end + 1), organization: { tags: data.tags as string[], color: data.color as Color, pinned: data.pinned as boolean }, header: end < 0 ? content + '\n' : content.slice(0, end + 1), data: data as Record<string, unknown> };
  } catch { return fallback; }
}
export function withBody(content: string, body: string) { return unpack(content).header + body; }
export function withOrganization(content: string, changes: Partial<Organization>) {
  const current = unpack(content);
  const metadata = { ...current.data, v: 1, ...current.organization, ...changes };
  const header = prefix + JSON.stringify(metadata).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') + ' -->';
  if (new TextEncoder().encode(header).length > 4096) throw new Error('This note has too much organization metadata. Export it before making changes.');
  return header + '\n' + current.body;
}
