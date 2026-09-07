import { test, expect } from 'bun:test';
import { noteOutline } from '../src/outline';

test('finds ATX and Setext headings with source UTF-16 offsets and readable labels', () => {
  const text = '# **Start** 😀\r\n\r\nA *section*\r\n---\r\n### End ###\r\n';
  expect(noteOutline(text)).toEqual([
    { level: 1, label: 'Start 😀', offset: 0 },
    { level: 2, label: 'A section', offset: text.indexOf('A *section*') },
    { level: 3, label: 'End', offset: text.indexOf('### End') },
  ]);
});

test('keeps duplicates and exact source offsets after reference definitions and code fences', () => {
  const text = '[link]: https://example.test\n\n# First\n\n```md\n# First\n```\n\n# First\n';
  expect(noteOutline(text)).toEqual([
    { level: 1, label: 'First', offset: text.indexOf('# First') },
    { level: 1, label: 'First', offset: text.lastIndexOf('# First') },
  ]);
});

test('matches rendered nested quote and list headings, while excluding escaped, thematic, indented, fenced, and HTML literal source', () => {
  const text = '\\# escaped\n\n---\n\n> - # Quoted list\n\n- Topic\n  ---\n\nOutside text\n\n    # code\n```md\n# fence\n```\n<div>\n# literal\n</div>\n\n# Visible';
  expect(noteOutline(text)).toEqual([
    { level: 1, label: 'Quoted list', offset: text.indexOf('> - # Quoted') },
    { level: 2, label: 'Topic', offset: text.indexOf('- Topic') },
    { level: 1, label: 'Visible', offset: text.indexOf('# Visible') },
  ]);
});

test('keeps later headings after an unmapable semantic gap, strict fences, and nested list continuations', () => {
  const text = '- Parent\n    # Continued\n\n```md\n<div>\n# still code\n```text\n# still code\n```\n\n# Later';
  expect(noteOutline(text)).toEqual([
    { level: 1, label: 'Continued', offset: text.indexOf('    # Continued') },
    { level: 1, label: 'Later', offset: text.lastIndexOf('# Later') },
  ]);
});

test('maps multiline Setext labels to the line that begins the rendered heading', () => {
  const text = 'First line\nsecond *line*\n=====\n\n# Later';
  expect(noteOutline(text)).toEqual([
    { level: 1, label: 'First line second line', offset: 0 },
    { level: 1, label: 'Later', offset: text.indexOf('# Later') },
  ]);
});
