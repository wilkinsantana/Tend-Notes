import { test, expect, type Page } from '@playwright/test';

const data = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tend-notes:demo-documents') ?? '[]') as Array<{id:string;name:string;content:string}>);
const picker = (page: Page) => page.getByRole('dialog', {name:'Start with a template'});
async function selectTemplate(page: Page, name = 'Grocery list') {
  await page.getByRole('button', {name:'Templates', exact:true}).click();
  await picker(page).getByRole('button', {name:new RegExp('^'+name)}).click();
  await picker(page).getByRole('button', {name:'Use template', exact:true}).click();
  return page.getByRole('dialog', {name:'New note', exact:true});
}

test('templates preview Markdown and cancel without changing the current note at either step', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:/Small things worth keeping.*Markdown/}).click();
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await editor.fill('My writing stays here.');
  await expect(page.getByRole('button', {name:'All changes saved', exact:true})).toBeVisible();
  const before = await data(page);
  const trigger = page.getByRole('button', {name:'Templates', exact:true});
  await trigger.click();
  await expect(picker(page).getByRole('heading', {name:'Produce', exact:true})).toBeVisible();
  await expect(picker(page).locator('input[type=checkbox]').first()).toBeDisabled();
  await page.keyboard.press('Control+Shift+N');
  expect(await data(page)).toEqual(before);
  await page.locator('.template-overlay').click({position:{x:2,y:2}});
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(editor).toHaveValue('My writing stays here.');
  const create = await selectTemplate(page, 'Meeting notes');
  await expect(create.getByLabel('Note name', {exact:true})).toBeFocused();
  expect(await data(page)).toEqual(before);
  await create.getByRole('button', {name:'Close dialog', exact:true}).click();
  expect(await data(page)).toEqual(before);
  await expect(editor).toHaveValue('My writing stays here.');
});

test('reusing a template creates fresh Markdown while previous completed items survive', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:/Small things worth keeping.*Markdown/}).click();
  await page.getByRole('button', {name:'Preview', exact:true}).click();
  const create = await selectTemplate(page);
  const firstName = await create.getByLabel('Note name', {exact:true}).inputValue();
  expect(firstName).toMatch(/^Grocery list /);
  await create.getByRole('button', {name:'Create note', exact:true}).click();
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(/## Produce/);
  const firstBody = await editor.inputValue();
  expect(firstBody).toContain('- [ ]');
  expect(firstBody).not.toContain('tend-notes');
  await editor.fill(firstBody.replace('- [ ]', '- [x]'));
  await expect(page.getByRole('button', {name:'All changes saved', exact:true})).toBeVisible();
  const second = await selectTemplate(page);
  const secondName = await second.getByLabel('Note name', {exact:true}).inputValue();
  expect(secondName).not.toEqual(firstName);
  await second.getByRole('button', {name:'Create note', exact:true}).click();
  await expect(editor).toHaveValue(firstBody);
  const documents = await data(page);
  expect(documents).toHaveLength(3);
  expect(documents.find(d => d.name === firstName+'.md')?.content).toContain('- [x]');
  expect(documents.find(d => d.name === secondName+'.md')?.content).toEqual(firstBody);
  await page.reload();
  await page.getByRole('button', {name:new RegExp(secondName+'.*Markdown')}).click();
  await expect(editor).toHaveValue(firstBody);
});

test('a failed current save blocks template creation and preserves the recoverable draft', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:/Small things worth keeping.*Markdown/}).click();
  const before = await data(page);
  await page.evaluate(() => { (window as any).notesDemo.saveFails = true; });
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await editor.fill('Do not lose this unsaved writing.');
  const create = await selectTemplate(page, 'Daily plan');
  await create.getByRole('button', {name:'Create note', exact:true}).click();
  await expect(create.getByRole('alert')).toContainText('Your open note could not be saved');
  expect(await data(page)).toEqual(before);
  await create.getByRole('button', {name:'Close dialog', exact:true}).click();
  await expect(editor).toHaveValue('Do not lose this unsaved writing.');
  await expect(editor).toBeEditable();
  await page.reload();
  await page.getByRole('button', {name:/Recovery copies/}).click();
  await page.locator('.recovery').getByRole('button', {name:'Small things worth keeping', exact:true}).click();
  await expect(editor).toHaveValue('Do not lose this unsaved writing.');
});

test('template filename conflict keeps the form intact and allows a deliberate retry', async ({page}) => {
  await page.goto('/');
  const before = await data(page);
  const create = await selectTemplate(page, 'Packing list');
  await create.getByLabel('Note name', {exact:true}).fill('Small things worth keeping');
  await create.getByRole('button', {name:'Create note', exact:true}).click();
  await expect(create.getByRole('alert')).toContainText('already exists');
  expect(await data(page)).toEqual(before);
  await create.getByLabel('Note name', {exact:true}).fill('Weekend packing');
  await create.getByRole('button', {name:'Create note', exact:true}).click();
  await expect(page.getByRole('textbox', {name:'Note Markdown'})).toHaveValue(/# Packing list/);
  expect(await data(page)).toHaveLength(2);
});

test('template picker fits a narrow panel, traps focus, and stays opaque with transparent Notes', async ({page}) => {
  await page.setViewportSize({width:390,height:780}); await page.goto('/');
  await page.getByRole('region', {name:'TEND Notes'}).evaluate(el => (el as HTMLElement).style.setProperty('--tend-panel-surface-alpha','0%'));
  const trigger = page.getByRole('button', {name:'Templates', exact:true});
  await trigger.click();
  const modal = picker(page);
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('button', {name:'Use template',exact:true})).toBeInViewport();
  expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth+1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await modal.evaluate(el => getComputedStyle(el).backgroundColor)).not.toMatch(/\/ 0\)|rgba\(0, 0, 0, 0\)/);
  await modal.getByRole('button', {name:'Use template',exact:true}).focus();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', {name:'Close template picker',exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('button', {name:'Use template',exact:true})).toBeFocused();
  await modal.getByRole('button', {name:'Cancel',exact:true}).click();
  await expect(trigger).toBeFocused();
  const create = await selectTemplate(page, 'Blank checklist');
  await expect(create.getByLabel('Note name', {exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(create).toHaveCount(0);
  expect(await data(page)).toHaveLength(1);
});

test('notebooks without creation support do not expose usable template creation', async ({page}) => {
  await page.goto('/?unconnected');
  await expect(page.getByRole('button', {name:'Templates',exact:true})).toBeDisabled();
  await expect(picker(page)).toHaveCount(0);
  expect(await data(page)).toHaveLength(1);
});

test('template creation waits for an in-flight current save before writing the new note', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:/Small things worth keeping.*Markdown/}).click();
  await page.evaluate(() => { (window as any).notesDemo.saveDelay = 2000; });
  const editor = page.getByRole('textbox', {name:'Note Markdown'});
  await editor.fill('Confirm this writing before making a template copy.');
  await page.getByRole('button', {name:'Save now', exact:true}).click();
  await expect(page.getByRole('button', {name:'Saving…', exact:true})).toBeVisible();
  const create = await selectTemplate(page, 'Project plan');
  await create.getByRole('button', {name:'Create note', exact:true}).click();
  await expect(create.getByRole('button', {name:'Creating…',exact:true})).toBeDisabled();
  expect(await data(page)).toHaveLength(1);
  await expect(create).toHaveCount(0);
  await expect(editor).toHaveValue(/# Project plan/);
  const documents = await data(page);
  expect(documents).toHaveLength(2);
  expect(documents.find(d => d.id === 'welcome')?.content).toBe('Confirm this writing before making a template copy.');
});
