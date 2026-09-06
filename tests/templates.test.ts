import { expect, test } from 'bun:test';
import { NOTE_TEMPLATES } from '../src/templates';

test('built-in templates have stable unique identities and portable Markdown content', () => {
  expect(NOTE_TEMPLATES).toHaveLength(6);
  expect(new Set(NOTE_TEMPLATES.map((template) => template.id)).size).toBe(NOTE_TEMPLATES.length);
  for (const template of NOTE_TEMPLATES) {
    expect(template.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(template.name.trim()).not.toBe('');
    expect(template.description.trim()).not.toBe('');
    expect(template.content.trim()).not.toBe('');
    expect(template.content).not.toMatch(/<!--\s*tend-notes|\{\{|\$\{|https?:\/\//i);
  }
});

test('checklist templates use ordinary unchecked Markdown tasks', () => {
  for (const template of NOTE_TEMPLATES) {
    expect(template.content).not.toMatch(/- \[[xX]\]/);
  }
  const grocery = NOTE_TEMPLATES.find((template) => template.id === 'grocery-list');
  expect(grocery?.content).toContain('## Produce');
  expect(grocery?.content).toContain('## Pantry');
  expect(grocery?.content).toContain('## Refrigerated');
  expect(grocery?.content).toContain('## Household');
  expect(grocery?.content.match(/- \[ \] \[Quantity\] Item/g)).toHaveLength(4);
});
