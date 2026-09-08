import { expect, test, type Page } from '@playwright/test';

const dailyName = (page: Page) => page.evaluate(() => {
  const now = new Date();
  return `Daily ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.md`;
});
const data = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tend-notes:demo-documents') ?? '[]') as Array<{id:string;name:string;content:string}>);

test('Today creates one local-date daily plan then reopens its edited canonical note', async ({page}) => {
  await page.goto('/');
  const name = await dailyName(page);
  const today = page.getByRole('button', {name:'Today', exact:true});
  await today.click();
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await expect(editor).toHaveValue(new RegExp(`# Daily ${name.slice(6, -3)}`));
  await editor.fill('# Edited daily note\n\nKeep this writing.');
  await expect(page.getByRole('button', {name:'All changes saved', exact:true})).toBeVisible();
  await today.click();
  await expect(editor).toHaveValue('# Edited daily note\n\nKeep this writing.');
  const documents = await data(page);
  expect(documents.filter(document => document.name === name)).toHaveLength(1);
});

test('Today reopens an existing edited same-day note without replacing it', async ({page}) => {
  const name = await dailyName(page);
  await page.addInitScript(({name}) => localStorage.setItem('tend-notes:demo-documents', JSON.stringify([
    {id:'welcome',libraryId:'personal',name:'Small things worth keeping.md',modifiedAt:1,size:5,content:'Welcome',revision:'a'.repeat(64)},
    {id:'today',libraryId:'personal',name,modifiedAt:2,size:24,content:'# Already edited\n\nDo not replace.',revision:'b'.repeat(64)},
  ])), {name});
  await page.goto('/');
  await page.getByRole('button', {name:'Today', exact:true}).click();
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await expect(editor).toHaveValue('# Already edited\n\nDo not replace.');
  const documents = await data(page);
  expect(documents.filter(document => document.name === name)).toHaveLength(1);
  expect(documents.find(document => document.name === name)?.content).toBe('# Already edited\n\nDo not replace.');
});

test('Today does not abandon a draft when its pre-transition save fails', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await page.evaluate(() => { (window as any).notesDemo.saveFails = true; });
  await editor.fill('Keep this unsaved draft before opening today.');
  await page.getByRole('button', {name:'Today', exact:true}).click();
  await expect(editor).toHaveValue('Keep this unsaved draft before opening today.');
  await expect(editor).toBeEditable();
  await expect(page.getByText('Demo connection interrupted')).toBeVisible();
  const name = await dailyName(page);
  expect((await data(page)).filter(document => document.name === name)).toHaveLength(0);
});

test('Today coalesces repeated activation into one create request', async ({page}) => {
  await page.goto('/');
  const name = await dailyName(page);
  const today = page.getByRole('button', {name:'Today', exact:true});
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Today"]')!;
    button.click(); button.click();
  });
  await expect(page.getByRole('textbox', {name:'Note Markdown'})).toBeVisible();
  expect((await data(page)).filter(document => document.name === name)).toHaveLength(1);
});

test('Today keeps the open daily session while its guarded read is pending', async ({page}) => {
  await page.goto('/');
  const today = page.getByRole('button', {name:'Today', exact:true});
  await today.click();
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await editor.fill('# Current daily text\n\nKeep this confirmed version.');
  await expect(page.getByRole('button', {name:'All changes saved', exact:true})).toBeVisible();
  await page.evaluate(() => { (window as any).notesDemo.readDelay = 500; });
  await today.click();
  await expect(editor).toHaveAttribute('readonly', '');
  await expect(editor).toHaveValue('# Current daily text\n\nKeep this confirmed version.');
  await expect(editor).not.toHaveAttribute('readonly', '');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('# Current daily text\n\nKeep this confirmed version.');
});

for (const [hook, label] of [
  ['todayCreateConflict', 'a duplicate-name race'],
  ['todayCreateLostResponse', 'a lost create response'],
] as const) {
  test(`Today resolves ${label} by opening the one winning note`, async ({page}) => {
    await page.goto('/');
    const name = await dailyName(page);
    await page.evaluate((hook) => { (window as any).notesDemo[hook] = true; }, hook);
    await page.getByRole('button', {name:'Today', exact:true}).click();
    const editor = page.getByRole('textbox', {name:'Note Markdown'});
    await expect(editor).toHaveValue('# Winning daily note\n\nA concurrent writer kept this text.');
    expect(await page.evaluate(() => (window as any).notesDemo.todayCreateCalls)).toBe(1);
    const documents = await data(page);
    expect(documents.filter(document => document.name === name)).toHaveLength(1);
    expect(documents.find(document => document.name === name)?.content).toBe('# Winning daily note\n\nA concurrent writer kept this text.');
  });
}


test('Today returns to the visible editor after Back to notes on a narrow panel', async ({page}) => {
  await page.setViewportSize({width:390, height:780});
  await page.goto('/');
  const name = await dailyName(page);
  const today = page.getByRole('button', {name:'Today', exact:true});
  await today.click();
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await expect(editor).toBeVisible();
  await page.getByRole('button', {name:'Back to notes', exact:true}).click();
  await expect(page.locator('aside')).toBeVisible();
  await today.click();
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  expect((await data(page)).filter(document => document.name === name)).toHaveLength(1);
});
