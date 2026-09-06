import { expect, test } from 'bun:test';
import { extractTasks, setTaskChecked } from '../src/tasks';

test('extracts unordered, ordered, nested, and quoted Markdown tasks in source order', () => {
  const content = [
    '# Plan',
    '',
    '- [ ] first',
    '  * [x] **nested** item',
    '12. [X] ordered',
    '> - [ ] quoted',
    '>   1) [x] quoted nested',
    '- > - [ ] quote nested on the same line',
    '- - [x] list nested on the same line',
    '',
  ].join('\n');

  const tasks = extractTasks(content);
  expect(tasks.map(({ line, text, checked }) => ({ line, text, checked }))).toEqual([
    { line: 3, text: 'first', checked: false },
    { line: 4, text: '**nested** item', checked: true },
    { line: 5, text: 'ordered', checked: true },
    { line: 6, text: 'quoted', checked: false },
    { line: 7, text: 'quoted nested', checked: true },
    { line: 8, text: 'quote nested on the same line', checked: false },
    { line: 9, text: 'list nested on the same line', checked: true },
  ]);
  for (const task of tasks) {
    expect(content[task.offset]).toMatch(/[ xX]/);
    expect(task.key).toBe(`${task.line}:${task.offset}`);
  }
});

test('ignores checkbox-shaped text in code, comments, raw HTML, and malformed lists', () => {
  const content = [
    '```md',
    '- [ ] fenced',
    '```',
    '',
    '    - [ ] indented code',
    '',
    '<!--',
    '- [x] hidden comment',
    '-->',
    '',
    '<div>',
    '- [ ] raw HTML',
    '</div>',
    '',
    '[ ] no list marker',
    '- [ ]',
    '- [x]missing whitespace',
    '- [maybe] malformed',
    '1234567890. [ ] too many ordered digits',
    'ordinary prose - [ ] is not a task',
    '- ordinary list text - [x] is not a nested task',
    '',
    '- [ ] visible',
  ].join('\n');

  expect(extractTasks(content).map((task) => task.text)).toEqual(['visible']);
});

test('preserves UTF-16 offsets, original line numbers, CRLF, unicode, and duplicate labels', () => {
  const header = '<!-- tend-notes {"v":1,"tags":[],"color":"none","pinned":false} -->\r\n';
  const content = `${header}😀 heading\r\n- [ ] café\r\n- [ ] café\r\n`;
  const tasks = extractTasks(content);

  expect(tasks).toHaveLength(2);
  expect(tasks.map(({ line, text, checked }) => ({ line, text, checked }))).toEqual([
    { line: 3, text: 'café', checked: false },
    { line: 4, text: 'café', checked: false },
  ]);
  expect(tasks[0].offset).toBe(content.indexOf('[ ] café') + 1);
  expect(tasks[1].offset).toBe(content.lastIndexOf('[ ] café') + 1);
  expect(tasks[0].key).not.toBe(tasks[1].key);

  const changed = setTaskChecked(content, tasks[1], true);
  expect(changed).toBe(content.slice(0, tasks[1].offset) + 'x' + content.slice(tasks[1].offset + 1));
  expect(changed).toContain('- [ ] café\r\n- [x] café\r\n');
  expect(changed.match(/\r\n/g)).toHaveLength(4);
});

test('rejects stale or forged task snapshots instead of matching labels fuzzily', () => {
  const content = '- [ ] duplicate\n- [ ] duplicate\n';
  const [first, second] = extractTasks(content);

  expect(() => setTaskChecked(content.replace('duplicate', 'renamed'), first, true)).toThrow(/no longer matches/);
  expect(() => setTaskChecked(content, { ...first, checked: true }, false)).toThrow(/no longer matches/);
  expect(() => setTaskChecked(content, { ...first, key: second.key }, true)).toThrow(/no longer matches/);
  expect(() => setTaskChecked(content, { ...first, offset: second.offset }, true)).toThrow(/no longer matches/);
  expect(setTaskChecked(content, first, false)).toBe(content);

  const code = '```\n- [ ] shaped like a task\n```\n';
  const offset = code.indexOf('[ ]') + 1;
  expect(() => setTaskChecked(code, {
    key: `2:${offset}`,
    offset,
    line: 2,
    text: 'shaped like a task',
    checked: false,
  }, true)).toThrow(/no longer matches/);
});
