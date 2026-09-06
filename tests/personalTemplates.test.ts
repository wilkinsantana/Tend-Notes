import { expect, test } from 'bun:test';
import type { Documents, Document, Note } from '../src/host';
import { unpack, withOrganization } from '../src/organization';
import { extractTasks } from '../src/tasks';
import { isPersonalTemplate, listPersonalTemplates, markPersonalTemplate, personalTemplateContent, readPersonalTemplate } from '../src/personalTemplates';

const note: Note = { id: 'source', libraryId: 'personal', name: 'Weekly list.md', modifiedAt: 1, size: 20 };
const body = '# Weekly list\r\n\r\n- [ ] Bread\r\n';

test('template designation survives Markdown export and removal preserves the note', () => {
  const original = '<!-- tend-notes {"v":1,"tags":["shopping"],"color":"sage","pinned":true,"future":"keep"} -->\n' + body;
  const marked = markPersonalTemplate(original, true);
  expect(isPersonalTemplate(marked)).toBe(true);
  expect(markPersonalTemplate(marked, true)).toBe(marked);
  const removed = markPersonalTemplate(marked, false);
  expect(unpack(removed).body).toBe(body);
  expect(unpack(removed).organization).toEqual(unpack(original).organization);
  expect(unpack(removed).data.future).toBe('keep');
});

test('a fresh copy retains writing and ordinary tags but is neither a template nor pinned', () => {
  const original = markPersonalTemplate(withOrganization(body, { tags: ['shopping'], pinned: true, color: 'amber' }), true);
  const copy = personalTemplateContent(original);
  expect(unpack(copy).body).toBe(body);
  expect(unpack(copy).organization).toEqual({ tags: ['shopping'], pinned: false, color: 'amber' });
  expect(isPersonalTemplate(original)).toBe(true);
  expect(extractTasks(original)).toEqual([]);
  expect(extractTasks(copy).map(task => task.text)).toEqual(['Bread']);
});

test('designation never discards a tag to fit the metadata bound', () => {
  const original = withOrganization(body, { tags: Array.from({ length: 12 }, (_, i) => `tag-${i}`) });
  expect(() => markPersonalTemplate(original, true)).toThrow('Remove one tag');
  expect(unpack(original).organization.tags).toHaveLength(12);
});

test('template discovery requests only the current notebook tag page', async () => {
  const calls: unknown[][] = [];
  const api = { async list(...args: unknown[]) { calls.push(args); return { items: [note], total: 1, nextOffset: null }; } } as unknown as Documents;
  const page = await listPersonalTemplates(api, 'personal');
  expect(page.items).toEqual([note]);
  expect(calls).toEqual([['personal', '', 0, { tag: 'template', sort: 'title' }]]);
  const invalid = { async list() { return { items: [], total: 1, nextOffset: 0 }; } } as unknown as Documents;
  await expect(listPersonalTemplates(invalid, 'personal')).rejects.toThrow('changed unexpectedly');
});

test('selection reads the latest canonical template and refuses moved or unmarked notes', async () => {
  let latest: Document = { ...note, content: markPersonalTemplate('# Updated source', true), revision: 'new' };
  const api = { async read() { return latest; } } as unknown as Documents;
  expect(unpack((await readPersonalTemplate(api, note)).content).body).toBe('# Updated source');
  latest = { ...latest, content: '# No longer a template' };
  await expect(readPersonalTemplate(api, note)).rejects.toThrow('no longer a template');
  latest = { ...latest, libraryId: 'elsewhere', content: markPersonalTemplate(body, true) };
  await expect(readPersonalTemplate(api, note)).rejects.toThrow('no longer a template');
});

test('relative uploads cannot silently become broken media in a fresh template copy', () => {
  const local = `![Picture](attachments/${'a'.repeat(64)}.png)`;
  expect(() => personalTemplateContent(markPersonalTemplate(local, true))).toThrow('uploaded media');
  const linked = '![Picture](https://example.org/picture.png)';
  expect(unpack(personalTemplateContent(markPersonalTemplate(linked, true))).body).toBe(linked);
});

test('attachment checks distinguish actual local Markdown destinations from web links and examples', () => {
  const path = `attachments/${'b'.repeat(64)}.png`;
  for (const body of [
    `![Web image](https://example.org/${path})`,
    `An example path is \`${path}\`.`,
    '```md\n![Example](' + path + ')\n```',
  ]) {
    expect(unpack(personalTemplateContent(markPersonalTemplate(body, true))).body).toBe(body);
  }
  expect(() => personalTemplateContent(markPersonalTemplate(`![Image][picture]\n\n[picture]: ${path}`, true))).toThrow('uploaded media');
});
