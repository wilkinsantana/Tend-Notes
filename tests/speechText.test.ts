import { expect, test } from 'bun:test';
import { markdownToSpeech } from '../src/speechText';

test('reads structure and link labels without metadata, code or resource URLs', () => {
  const source = '---\ntags: [private]\n---\n# Shopping\n\n- [ ] **Milk**\n- [x] Bread\n\n[Recipe](https://example.test/private)\n\n![A loaf](https://example.test/image.png)\n\n`secret()`\n\n```js\npassword = 42\n```\n\nhttps://example.test/raw';
  const text = markdownToSpeech(source);
  expect(text).toContain('Shopping');
  expect(text).toContain('Milk');
  expect(text).toContain('Bread');
  expect(text).toContain('Recipe');
  expect(text).toContain('A loaf');
  for (const hidden of ['tags:', 'private', 'secret()', 'password', 'https:', '[x]', '[ ]']) expect(text).not.toContain(hidden);
});

test('table cells stay in row order without markdown pipes', () => {
  const text = markdownToSpeech('| Item | Amount |\n|---|---|\n| Apples | Two |\n| Pears | Three |');
  expect(text).toBe('Item; Amount\nApples; Two\nPears; Three');
});

test('does not speak executable HTML or empty formatting', () => {
  expect(markdownToSpeech('<script>fetch("secret")</script>\n\n---')).toBe('');
  expect(markdownToSpeech('Hello <strong>world</strong>.')).toBe('Hello world.');
});
