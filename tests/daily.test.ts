import { expect, test } from 'bun:test';
import { dailyNote, localDay } from '../src/daily';

test('daily notes use the opener local calendar day rather than UTC', () => {
  const date = new Date(2026, 8, 6, 0, 5, 0);
  expect(localDay(date)).toBe('2026-09-06');
  expect(dailyNote(date)).toEqual({
    day: '2026-09-06',
    name: 'Daily 2026-09-06.md',
    content: expect.stringContaining('# Daily 2026-09-06'),
  });
});

test('daily notes remain the portable daily-plan Markdown', () => {
  const content = dailyNote(new Date(2026, 0, 2)).content;
  expect(content).toContain('## Top priorities');
  expect(content).toContain('## Schedule');
  expect(content).toContain('## Notes');
  expect(content).toContain('- [ ] [Priority]');
  expect(content).not.toContain('tend-notes');
});
