import { test, expect, type Page, type Locator } from '@playwright/test';

async function openNote(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Small things worth keeping.*Markdown/ }).click();
  return page.getByRole('textbox', { name: 'Note Markdown' });
}
async function position(editor: Locator, start: number, end = start) {
  await editor.evaluate((node: HTMLTextAreaElement, selection) => { node.focus(); node.setSelectionRange(selection.start, selection.end); }, { start, end });
}
async function selected(editor: Locator) {
  return editor.evaluate((node: HTMLTextAreaElement) => ({ start: node.selectionStart, end: node.selectionEnd }));
}

test('keyboard find navigates literal matches, wraps, and returns to writing without changing it', async ({ page }) => {
  const editor = await openNote(page);
  const body = '😀 Alpha alpha ALPHA [a+b]';
  await editor.fill(body); await position(editor, 0);
  await page.keyboard.press('Control+f');
  const field = page.getByRole('textbox', { name: 'Find text in note' });
  await expect(field).toBeFocused();
  await field.fill('alpha');
  await expect.poll(() => selected(editor)).toEqual({ start: 3, end: 8 });
  await expect(page.locator('.find-highlights mark')).toHaveCount(3);
  await expect(page.locator('.find-highlights mark.active')).toHaveText('Alpha');
  await field.press('Enter');
  await expect.poll(() => selected(editor)).toEqual({ start: 9, end: 14 });
  await field.press('Shift+Enter');
  await expect.poll(() => selected(editor)).toEqual({ start: 3, end: 8 });
  await field.press('Shift+Enter');
  await expect.poll(() => selected(editor)).toEqual({ start: 15, end: 20 });
  await field.fill('[a+b]');
  await expect.poll(() => selected(editor)).toEqual({ start: 21, end: 26 });
  await field.press('Escape');
  await expect(page.getByRole('search', { name: 'Find in note' })).toHaveCount(0);
  await expect(editor).toBeFocused(); await expect(editor).toHaveValue(body);
});

test('selected text seeds find, case matching is explicit, and Ctrl+F refocuses it', async ({ page }) => {
  const editor = await openNote(page);
  await editor.fill('Alpha alpha ALPHA'); await position(editor, 0, 5);
  await page.getByRole('button', { name: 'Find in note', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Find text in note' });
  await expect(field).toHaveValue('Alpha');
  await page.getByRole('button', { name: 'Match case', exact: true }).click();
  await expect(page.getByRole('search').getByRole('status')).toHaveText('1 / 1');
  await position(editor, 6); await page.keyboard.press('Control+f');
  await expect(field).toBeFocused();
  await field.fill('absent');
  await expect(page.getByRole('search').getByRole('status')).toHaveText('No matches');
  await expect(page.getByRole('button', { name: 'Next match', exact: true })).toBeDisabled();
});

test('typing with find open never moves the caret or creates an undo step for searching', async ({ page }) => {
  const editor = await openNote(page);
  await editor.fill('alpha'); await position(editor, 0);
  await page.getByRole('button', { name: 'Find in note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find text in note' }).fill('alpha');
  await position(editor, 5); await page.keyboard.type(' beta');
  await expect(editor).toHaveValue('alpha beta');
  await expect.poll(() => selected(editor)).toEqual({ start: 10, end: 10 });
  await page.getByRole('button', { name: 'Close find', exact: true }).click();
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue('alpha');
});

test('find reveals soft-wrapped matches and closes when switching to Preview', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const editor = await openNote(page);
  const body = 'A long paragraph with natural wrapping. '.repeat(300) + 'Destination';
  await editor.fill(body); await position(editor, 0);
  await page.getByRole('button', { name: 'Find in note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find text in note' }).fill('Destination');
  await expect.poll(() => editor.evaluate((node: HTMLTextAreaElement) => node.scrollTop / (node.scrollHeight - node.clientHeight))).toBeGreaterThan(.9);
  await expect(editor).toHaveValue(body);
  const rect = await page.locator('.find-highlights mark.active').boundingBox();
  const area = await editor.boundingBox();
  expect(rect!.y).toBeGreaterThanOrEqual(area!.y);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(area!.y + area!.height);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('search', { name: 'Find in note' })).toHaveCount(0);
});

test('find remains compact and reachable on a narrow panel', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const editor = await openNote(page);
  await editor.fill('# A little space to think\n\nKeep an idea close. Every small idea matters.');
  await page.getByRole('button', { name: 'Find in note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find text in note' }).fill('idea');
  await expect(page.getByRole('button', { name: 'Close find', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('find.png') });
});


test('highlights follow split resizing and scrolling without covering the reading pane', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const editor = await openNote(page);
  await editor.fill('# A quiet writing space\n\nFind a thought. Keep that thought.\n\n' + 'A long line that wraps naturally. '.repeat(200) + 'Destination');
  await position(editor, 0);
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await page.getByRole('button', { name: 'Find in note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find text in note' }).fill('thought');
  await expect(page.locator('.find-highlights mark')).toHaveCount(2);
  const highlights = await page.locator('.find-highlights').boundingBox();
  const area = await editor.boundingBox();
  expect(highlights!.x).toBe(area!.x);
  expect(highlights!.width).toBeLessThanOrEqual(area!.width);
  await page.screenshot({ path: testInfo.outputPath('find-desktop.png') });
  await page.locator('.notes-app').evaluate(node => (node as HTMLElement).style.setProperty('--font-sans', 'monospace'));
  await expect.poll(() => page.locator('.find-highlights .mirror').evaluate(node => getComputedStyle(node).fontFamily)).toContain('monospace');
  await editor.evaluate((node: HTMLTextAreaElement) => node.scrollTop = node.scrollHeight);
  await expect.poll(() => page.locator('.find-highlights .mirror').evaluate(node => getComputedStyle(node).transform)).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
  await page.getByRole('button', { name: 'Close find', exact: true }).click();
  await expect(page.locator('.find-highlights')).toHaveCount(0);
});
