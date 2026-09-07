import { test, expect } from 'bun:test';
import { findInNote, MAX_FIND_MATCHES } from '../src/find';

test('finds case-insensitive literal text at original Unicode offsets', () => {
  const body = '😀 Alpha alpha ALPHA';
  expect(findInNote(body, 'alpha').matches).toEqual([{ start: 3, end: 8 }, { start: 9, end: 14 }, { start: 15, end: 20 }]);
  expect(findInNote(body, 'Alpha', true).matches).toEqual([{ start: 3, end: 8 }]);
});
test('does not interpret search text as a regular expression', () => {
  const body = '# C++ [a+b] (x) .* $5 \\path';
  for (const query of ['C++', '[a+b]', '(x)', '.*', '$5', '\\path']) {
    const match = findInNote(body, query).matches;
    expect(match).toHaveLength(1);
    expect(body.slice(match[0].start, match[0].end)).toBe(query);
  }
});
test('Unicode matching never shifts offsets by lowercasing the source', () => {
  const body = 'İ then TARGET and 𐐀';
  expect(findInNote(body, 'target').matches[0]).toEqual({ start: body.indexOf('TARGET'), end: body.indexOf('TARGET') + 6 });
  expect(findInNote(body, '𐐨').matches[0]).toEqual({ start: body.indexOf('𐐀'), end: body.length });
});
test('empty or oversized queries do not enumerate matches', () => {
  expect(findInNote('text', '')).toEqual({ matches: [], truncated: false });
  expect(findInNote('x'.repeat(300), 'x'.repeat(257))).toEqual({ matches: [], truncated: false });
});
test('bounds match storage and explicitly reports truncation', () => {
  expect(findInNote('a'.repeat(MAX_FIND_MATCHES), 'a').truncated).toBe(false);
  const result = findInNote('a'.repeat(1_048_576), 'a');
  expect(result.matches).toHaveLength(MAX_FIND_MATCHES);
  expect(result.truncated).toBe(true);
});
