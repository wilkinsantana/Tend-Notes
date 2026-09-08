import { test, expect, type Page } from '@playwright/test';
const records = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tend-notes:demo-trash') ?? '{"items":[],"operations":{}}'));
async function moveWelcome(page: Page) {
  await page.getByRole('button', {name: 'Delete Small things worth keeping', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Delete note', exact: true});
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Move to Trash', exact: true}).click();
  return dialog;
}
test('Trash restores Markdown, resolves a name collision, and survives reload', async ({page}) => {
  await page.goto('/?trash');
  await moveWelcome(page);
  await expect(page.locator('.note')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', {name: 'Trash', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Trash', exact: true})).toBeVisible();
  await page.evaluate(() => {
    const row = JSON.parse(localStorage.getItem('tend-notes:demo-trash')!).items[0];
    localStorage.setItem('tend-notes:demo-documents', JSON.stringify([{...row.document, id:'replacement', content:'Replacement stays'}]));
  });
  await page.getByRole('button', {name: 'Restore', exact: true}).click();
  await page.getByRole('button', {name: 'Restore', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await page.getByRole('button', {name: 'Restore', exact: true}).click();
  await page.getByRole('textbox', {name: /Restore .* as/}).fill('Recovered idea');
  await page.getByRole('button', {name: 'Restore', exact: true}).click();
  await expect(page.getByText('Trash is empty', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Back to Notes', exact:true}).click();
  await page.getByRole('button', {name:/Recovered idea.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(page.getByRole('textbox', {name:'Note Markdown'})).toHaveValue(/Small things worth keeping/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tend-notes:demo-documents')!).find((doc:any) => doc.id === 'replacement').content)).toBe('Replacement stays');
});
test('lost move response checks the same operation and permanent deletion needs only confirmation', async ({page}) => {
  await page.setViewportSize({width:390, height:780});
  await page.goto('/?trash');
  await page.evaluate(() => { (window as any).notesDemo.trashLoseResponse = true; });
  const dialog = await moveWelcome(page);
  await expect(dialog.getByRole('button', {name:'Check status', exact:true})).toBeVisible();
  const before = await records(page);
  expect(Object.keys(before.operations)).toHaveLength(1);
  await dialog.getByRole('button', {name:'Check status', exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(Object.keys((await records(page)).operations)).toEqual(Object.keys(before.operations));
  await page.getByRole('button', {name:'Trash', exact:true}).click();
  await page.getByRole('button', {name:'Permanently delete', exact:true}).click();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', {name:'Cancel', exact:true}).click();
  expect((await records(page)).items).toHaveLength(1);
  await page.getByRole('button', {name:'Permanently delete', exact:true}).click();
  await page.getByRole('button', {name:'Delete', exact:true}).click();
  await expect(page.getByText('Trash is empty', {exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('a failed current save blocks moving to Trash and retains the draft', async ({page}) => {
  await page.goto('/?trash');
  await page.getByRole('button', {name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.evaluate(() => { (window as any).notesDemo.saveFails = true; });
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await editor.fill('Keep this unsaved draft.');
  await page.getByRole('button', {name:'Delete note', exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'Delete note', exact:true});
  await dialog.getByRole('button', {name:'Move to Trash', exact:true}).click();
  await expect(dialog).toBeVisible();
  expect((await records(page)).items).toHaveLength(0);
  await dialog.getByRole('button', {name:'Cancel', exact:true}).click();
  await expect(editor).toHaveValue('Keep this unsaved draft.');
});

test('uncertain restore retries the exact input even when the first request never arrived', async ({page}) => {
  await page.goto('/?trash'); await moveWelcome(page);
  await page.getByRole('button', {name:'Trash', exact:true}).click();
  await page.getByRole('button', {name:'Restore', exact:true}).click();
  await page.getByRole('textbox', {name:/Restore .* as/}).fill('Recovered after disconnect');
  await page.evaluate(() => { (window as any).notesDemo.trashBeforeSend = true; });
  await page.getByRole('button', {name:'Restore', exact:true}).click();
  await expect(page.getByRole('button', {name:'Check status', exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Check status', exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('not found');
  await page.getByRole('button', {name:'Retry', exact:true}).click();
  await expect(page.getByText('Trash is empty', {exact:true})).toBeVisible();
  const state = await records(page);
  expect(Object.values(state.operations).filter((op:any) => op.action === 'restore')).toHaveLength(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tend-notes:demo-documents')!)[0].name)).toBe('Recovered after disconnect.md');
});
test('closing an uncertain move protects organization and status can still reconcile', async ({page}) => {
  await page.goto('/?trash');
  await page.getByRole('button', {name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.evaluate(() => { (window as any).notesDemo.trashLoseResponse = true; });
  await page.getByRole('button', {name:'Delete note', exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'Delete note', exact:true});
  await dialog.getByRole('button', {name:'Move to Trash', exact:true}).click();
  await expect(dialog.getByRole('button', {name:'Check status', exact:true})).toBeVisible();
  await dialog.getByRole('button', {name:'Close', exact:true}).click();
  await expect(page.getByRole('textbox', {name:'Note Markdown'})).toHaveAttribute('readonly', '');
  await page.getByRole('button', {name:'Pin note', exact:true}).click();
  await expect(page.getByRole('button', {name:'All changes saved', exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Delete note', exact:true}).click();
  await dialog.getByRole('button', {name:'Check status', exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('textbox', {name:'Note Markdown'})).toHaveCount(0);
});
test('an unsupported recovery capability never falls back to permanent deletion', async ({page}) => {
  await page.goto('/?trash&future-trash');
  await page.getByRole('button', {name:'Delete Small things worth keeping', exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'Delete note', exact:true});
  await dialog.getByRole('button', {name:'Delete note', exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Update Notes');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tend-notes:demo-documents')!).length)).toBe(1);
});
