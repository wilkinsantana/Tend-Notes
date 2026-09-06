import type { Documents, Note, Page } from './host';
import { unpack, withOrganization } from './organization';
import type { NoteTemplate } from './templates';
import { Marked } from 'marked';

/** A visible, portable tag is the complete template designation. */
export const TEMPLATE_TAG = 'template';

export function isPersonalTemplate(content: string): boolean {
  return unpack(content).organization.tags.includes(TEMPLATE_TAG);
}

export function markPersonalTemplate(content: string, enabled: boolean): string {
  const { tags } = unpack(content).organization;
  if (tags.includes(TEMPLATE_TAG) === enabled) return content;
  if (enabled && tags.length >= 12) throw new Error('Remove one tag before adding this note to Templates.');
  return withOrganization(content, {
    tags: enabled ? [...tags, TEMPLATE_TAG] : tags.filter(tag => tag !== TEMPLATE_TAG),
  });
}

export function personalTemplateContent(content: string): string {
  // Relative uploads belong to the source note's folder. A new note can have a
  // different parent even within one notebook; copying the text alone would
  // silently break its media. Keep the source intact until media-copy support.
  const parser = new Marked({ gfm: true, async: false });
  let localAttachment = false;
  parser.walkTokens(parser.lexer(unpack(content).body), token => {
    if ((token.type === 'image' || token.type === 'link')
      && /^attachments\/[a-f0-9]{64}\.(?:png|jpg|gif|webp|ogg|webm|mp3|m4a|wav)$/.test(token.href)) {
      localAttachment = true;
    }
  });
  if (localAttachment) {
    throw new Error('This template contains uploaded media. Use web links in reusable templates until attachment copying is available.');
  }
  const parsed = unpack(content);
  return withOrganization(content, {
    tags: parsed.organization.tags.filter(tag => tag !== TEMPLATE_TAG),
    pinned: false,
  });
}

export async function listPersonalTemplates(api: Documents, libraryId: string, offset = 0): Promise<Page> {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Refresh Templates to load this page.');
  const page = await api.list(libraryId, '', offset, { tag: TEMPLATE_TAG, sort: 'title' });
  if (page.items.length > 100 || page.items.some(note => note.libraryId !== libraryId)
    || (page.nextOffset !== null && (!Number.isSafeInteger(page.nextOffset) || page.nextOffset <= offset))) {
    throw new Error('The template list changed unexpectedly. Refresh Templates and try again.');
  }
  return page;
}

export async function readPersonalTemplate(api: Documents, note: Note): Promise<NoteTemplate> {
  const document = await api.read(note.id);
  if (document.id !== note.id || document.libraryId !== note.libraryId || !isPersonalTemplate(document.content)) {
    throw new Error('This note is no longer a template here. Refresh Templates and choose it again.');
  }
  return {
    id: `personal:${document.id}`,
    name: document.name.replace(/\.(md|markdown)$/i, ''),
    description: 'Your reusable Markdown note.',
    content: personalTemplateContent(document.content),
  };
}
