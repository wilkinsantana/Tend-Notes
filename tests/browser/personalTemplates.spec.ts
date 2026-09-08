import { test, expect, type Page } from '@playwright/test';

type DemoNote = {id: string; libraryId: string; name: string; content: string; revision: string; modifiedAt: number; size: number; canWrite?: boolean};
const key = 'tend-notes:demo-documents';
const picker = (page: Page) => page.getByRole('dialog', {name:'Start with a template'});
const data = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tend-notes:demo-documents') ?? '[]') as DemoNote[]);
const tagged = (body: string, tags = ['template'], pinned = true) => `<!-- tend-notes {"v":1,"tags":${JSON.stringify(tags)},"color":"none","pinned":${pinned}} -->\n${body}`;

async function seed(page: Page, notes: DemoNote[]) {
  await page.evaluate(([storageKey, value]) => localStorage.setItem(storageKey as string, JSON.stringify(value)), [key, notes]);
  await page.reload();
}
function source(id = 'personal-template', content = tagged('# Weekly plan\n\n- [ ] Keep the source task.')): DemoNote {
  return {id, libraryId:'personal', name:'Weekly plan.md', content, revision:`revision-${id}`, modifiedAt:1_700_000_000, size:content.length};
}
async function pickPersonal(page: Page, name = 'Weekly plan') {
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await picker(page).getByRole('button', {name:new RegExp(`^${name}`)}).click();
  await picker(page).getByRole('button', {name:'Use template', exact:true}).click();
}

test('a marked note survives reload and creates a fresh unpinned copy without changing its source', async ({page}) => {
  await page.goto('/');
  const original = source();
  await seed(page, [original]);
  await pickPersonal(page);
  const create = page.getByRole('dialog', {name:'New note'});
  await expect(create).toBeVisible();
  await create.getByRole('button', {name:'Create note', exact:true}).click();
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await expect(editor).toHaveValue(/Keep the source task/);
  const all = await data(page);
  expect(all.find(note => note.id === original.id)?.content).toBe(original.content);
  const copy = all.find(note => note.id !== original.id)!;
  expect(copy.content).toMatch(/^<!-- tend-notes /);
  expect(copy.content).not.toContain('"template"');
  expect(copy.content).toContain('"pinned":false');
  expect(copy.content).toContain('Keep the source task');
  await page.reload();
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await expect(picker(page).getByRole('button', {name:/^Weekly plan/})).toBeVisible();
});

test('adding and removing the current template tag saves through the open note without deleting it', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  const dialog = picker(page);
  await dialog.getByRole('button', {name:'Add current note to templates', exact:true}).click();
  await expect(dialog.getByRole('button', {name:'Remove from templates', exact:true})).toBeVisible();
  expect((await data(page))[0].content).toContain('"template"');
  await dialog.getByRole('button', {name:'Remove from templates', exact:true}).click();
  await expect(dialog.getByRole('button', {name:'Add current note to templates', exact:true})).toBeVisible();
  const all = await data(page);
  expect(all).toHaveLength(1);
  expect(all[0].content).not.toContain('"template"');
});

test('a failed current save keeps the template picker and recoverable draft intact', async ({page}) => {
  await page.goto('/');
  await seed(page, [source()]);
  await page.getByRole('button', {name:/Weekly plan.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await editor.fill('Do not lose this personal template draft.');
  await page.evaluate(() => { (window as any).notesDemo.saveFails = true; });
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await picker(page).getByRole('button', {name:/^Weekly plan/}).click();
  await picker(page).getByRole('button', {name:'Use template', exact:true}).click();
  await expect(picker(page).getByRole('alert')).toContainText('could not be saved');
  await picker(page).getByRole('button', {name:'Remove from templates', exact:true}).click();
  await expect(picker(page).getByRole('alert')).toContainText('before changing its template tag');
  await picker(page).getByRole('button', {name:'Close template picker', exact:true}).click();
  await expect(editor).toHaveValue('Do not lose this personal template draft.');
  expect((await data(page))[0].content).toContain('Keep the source task');
});

test('personal selection reads current source content and does nothing after the picker closes', async ({page}) => {
  await page.goto('/');
  const original = source();
  await seed(page, [original]);
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  const changed = tagged('# Weekly plan\n\nFresh source content wins.');
  await page.evaluate(([storageKey, next]) => {
    const all = JSON.parse(localStorage.getItem(storageKey as string) ?? '[]');
    all[0] = next;
    localStorage.setItem(storageKey as string, JSON.stringify(all));
  }, [key, {...original, content:changed, size:changed.length}]);
  await picker(page).getByRole('button', {name:/^Weekly plan/}).click();
  const preview = picker(page).getByLabel('Weekly plan preview');
  await expect(preview).toContainText('Fresh source content wins');
  await expect(preview).not.toContainText('tend-notes');
  await picker(page).getByRole('button', {name:'Use template', exact:true}).click();
  await expect(page.getByRole('dialog', {name:'New note'})).toBeVisible();
  await page.getByRole('dialog', {name:'New note'}).getByRole('button', {name:'Create note', exact:true}).click();
  await expect(page.getByRole('textbox', {name:'Note Markdown'})).toHaveValue(/Fresh source content wins/);

  await page.goto('/');
  await page.evaluate(() => { (window as any).notesDemo.readDelay = 1500; });
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await picker(page).getByRole('button', {name:/^Weekly plan/}).dispatchEvent('click');
  await picker(page).getByRole('button', {name:'Close template picker', exact:true}).click();
  await page.waitForTimeout(1600);
  await expect(picker(page)).toHaveCount(0);
  await expect(page.getByRole('dialog', {name:'New note'})).toHaveCount(0);
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await expect(picker(page).getByRole('button', {name:/^Weekly plan/})).toBeEnabled();
  await picker(page).getByRole('button', {name:'Cancel', exact:true}).click();

  await page.evaluate(() => { (window as any).notesDemo.readDelay = 0; });
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await picker(page).getByRole('button', {name:/^Weekly plan/}).click();
  await expect(picker(page).getByLabel('Weekly plan preview')).toContainText('Fresh source content wins');
  await page.evaluate(() => { (window as any).notesDemo.readDelay = 1500; });
  const use = picker(page).getByRole('button', {name:'Use template', exact:true});
  await use.focus();
  await use.evaluate((element: HTMLElement) => element.click());
  await expect(picker(page).getByRole('button', {name:/^Grocery list/})).toBeDisabled();
  await expect(picker(page).getByRole('button', {name:'Add current note to templates', exact:true})).toBeDisabled();
  await picker(page).getByRole('button', {name:'Close template picker', exact:true}).click();
  await page.waitForTimeout(1600);
  await expect(page.getByRole('dialog', {name:'New note'})).toHaveCount(0);
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await expect(picker(page).getByRole('button', {name:/^Weekly plan/})).toBeEnabled();
  await picker(page).getByRole('button', {name:'Cancel', exact:true}).click();
});

test('template use waits for a current tag save and the action remains usable after reopening', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await page.evaluate(() => { (window as any).notesDemo.saveDelay = 1000; });
  const dialog = picker(page);
  await dialog.getByRole('button', {name:'Add current note to templates', exact:true}).click();
  await expect(dialog.getByRole('button', {name:'Use template', exact:true})).toBeDisabled();
  await expect(dialog.getByRole('button', {name:'Remove from templates', exact:true})).toBeVisible();
  await expect(dialog.getByRole('button', {name:'Use template', exact:true})).toBeEnabled();
  await dialog.getByRole('button', {name:'Close template picker', exact:true}).click();
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await expect(picker(page).getByRole('button', {name:'Remove from templates', exact:true})).toBeEnabled();
});

test('read-only notes cannot change their template tag, and the picker remains keyboard-safe on narrow panels', async ({page}) => {
  await page.setViewportSize({width:390, height:780});
  await page.goto('/');
  const readonly = {...source('readonly'), canWrite:false};
  await seed(page, [readonly]);
  await page.getByRole('button', {name:/Weekly plan.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('button', {name:'Back to notes', exact:true}).click();
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  const dialog = picker(page);
  await expect(dialog.getByRole('button', {name:'Remove from templates', exact:true})).toBeDisabled();
  await expect(dialog.getByText('read-only', {exact:false})).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const preview = dialog.getByLabel('Grocery list preview');
  expect(await preview.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(140);
  await expect(preview.getByText('Produce', {exact:true})).toBeVisible();
  await dialog.getByRole('button', {name:'Use template', exact:true}).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', {name:'Close template picker', exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
