import { expect, test } from 'bun:test';
import { EditorHistory } from '../src/editorHistory';

test('groups contiguous typing and shares one undo and redo result', () => {
  const history = new EditorHistory('');
  history.record('a', {start: 0, end: 0}, {start: 1, end: 1}, 'insertText', 10);
  history.record('ab', {start: 1, end: 1}, {start: 2, end: 2}, 'insertText', 20);
  expect(history.undo()).toEqual({body: '', start: 0, end: 0});
  expect(history.redo()).toEqual({body: 'ab', start: 2, end: 2});
});

test('cursor moves and atomic formatting remain separate steps', () => {
  const history = new EditorHistory('word');
  history.record('word!', {start: 4, end: 4}, {start: 5, end: 5}, 'insertText', 10);
  history.record('Xword!', {start: 0, end: 0}, {start: 1, end: 1}, 'insertText', 20);
  history.record('**Xword!**', {start: 0, end: 6}, {start: 2, end: 8});
  expect(history.undo()?.body).toBe('Xword!');
  expect(history.undo()?.body).toBe('word!');
  expect(history.undo()?.body).toBe('word');
});

test('a new edit clears redo and sync prevents stale-note history', () => {
  const history = new EditorHistory('one');
  history.record('one two', null, {start: 7, end: 7});
  history.undo();
  history.record('one!', null, {start: 4, end: 4});
  expect(history.canRedo).toBe(false);
  history.sync('remote');
  expect(history.canUndo).toBe(false);
  expect(history.body).toBe('remote');
});

test('drops oldest complete groups when bounded', () => {
  const history = new EditorHistory('', 2, 3);
  history.record('a', null, {start: 1, end: 1});
  history.record('ab', null, {start: 2, end: 2});
  history.record('abc', null, {start: 3, end: 3});
  expect(history.undo()?.body).toBe('ab');
  expect(history.undo()?.body).toBe('a');
  expect(history.canUndo).toBe(false);
});


test('continuous typing and oversized replacements cannot evade memory bounds', () => {
  const history = new EditorHistory('', 120, 600);
  for (let i = 1; i <= 2000; i++) history.record('x'.repeat(i), {start:i-1,end:i-1}, {start:i,end:i}, 'insertText', i);
  expect(history.undo()?.body.length).toBe(1500);
  expect(history.canUndo).toBe(false);
  history.record('large'.repeat(1000), null, {start:5000,end:5000});
  expect(history.canUndo).toBe(false);
  expect(history.canRedo).toBe(false);
});
