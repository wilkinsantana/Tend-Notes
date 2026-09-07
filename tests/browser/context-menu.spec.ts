import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tend-notes:demo-documents', JSON.stringify([
    { id: 'active', libraryId: 'personal', name: 'Current draft.md', modifiedAt: 20, size: 14, content: '# Keep writing', revision: 'active' },
    { id: 'other', libraryId: 'personal', name: 'Other note.md', modifiedAt: 10, size: 17, content: '# Separate source', revision: 'other' },
  ])));
  await page.goto('/');
});

test('right-click renames the targeted unselected note without changing the open draft', async ({ page }) => {
  await page.getByRole('button', { name: /Current draft.*Markdown/ }).click();
  const editor = page.getByRole('textbox', { name: 'Note Markdown' });
  await editor.fill('# Keep my current writing');
  const row = page.locator('.note').filter({ has: page.locator('.note-open', { hasText: 'Other note' }) });
  await row.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Actions for Other note' });
  await menu.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename note', exact: true });
  await expect(dialog.getByLabel('Note name', { exact: true })).toHaveValue('Other note');
  await dialog.getByLabel('Note name', { exact: true }).fill('Renamed note');
  await dialog.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('button', { name: /Renamed note.*Markdown/ })).toBeVisible();
  await expect(editor).toHaveValue('# Keep my current writing');
  await expect(page.getByRole('button', { name: 'Rename current note' })).toHaveText('Current draft');
});

test('keyboard context menu navigates, wraps, and returns focus without opening a note', async ({ page }) => {
  const trigger = page.getByRole('button', { name: /Other note.*Markdown/ });
  await trigger.focus();
  await trigger.press('Shift+F10');
  const menu = page.getByRole('menu', { name: 'Actions for Other note' });
  await expect(menu.getByRole('menuitem', { name: 'Rename', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Rename', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('p');
  await expect(menu.getByRole('menuitem', { name: 'Pin', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Note Markdown' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('context actions reuse pin, color, export, and the existing delete confirmation', async ({ page }) => {
  const row = page.locator('.note').filter({ has: page.locator('.note-open', { hasText: 'Other note' }) });
  const menu = page.getByRole('menu', { name: 'Actions for Other note' });
  await row.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Pin', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Unpin Other note', exact: true })).toBeVisible();
  await row.click({ button: 'right' });
  await expect(menu.getByRole('menuitem', { name: 'Unpin', exact: true })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Note color', exact: true }).click();
  await row.getByRole('button', { name: 'sage note color', exact: true }).click();
  await expect(row).toHaveAttribute('data-note-color', 'sage');
  await row.click({ button: 'right' });
  const downloadPromise = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: 'Export Markdown', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Other note.md');
  expect(await readFile((await download.path())!, 'utf8')).toContain('# Separate source');
  await row.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete note', exact: true });
  await expect(dialog).toContainText('Other note');
  await expect(row).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();
});

test('menu clamps to a narrow viewport and dismisses outside without an action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const row = page.locator('.note').filter({ has: page.locator('.note-open', { hasText: 'Other note' }) });
  await row.dispatchEvent('contextmenu', { clientX: 388, clientY: 398, button: 2 });
  const menu = page.getByRole('menu', { name: 'Actions for Other note' });
  await expect(menu).toBeVisible();
  expect(await menu.evaluate(node => {
    const box = node.getBoundingClientRect();
    return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
  })).toBe(true);
  await page.locator('.brand').click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toBeVisible();
});
