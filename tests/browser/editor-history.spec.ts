import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name: /Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  return page.getByRole('textbox', {name:'Note Markdown'});
}
const undo = (page:Page) => page.getByRole('button',{name:'Undo',exact:true});
const redo = (page:Page) => page.getByRole('button',{name:'Redo',exact:true});

test('toolbar and keyboard share typing, formatting and list history across view modes', async ({page}) => {
  const editor = await open(page);
  await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
  await editor.fill('Hello');
  await editor.press('End'); await editor.pressSequentially(' world');
  await undo(page).click(); await expect(editor).toHaveValue('Hello');
  await editor.press('Control+Shift+Z'); await expect(editor).toHaveValue('Hello world');
  await editor.press('Control+a'); await page.getByRole('button',{name:'Bold',exact:true}).click();
  await expect(editor).toHaveValue('**Hello world**');
  await undo(page).click(); await expect(editor).toHaveValue('Hello world');
  await redo(page).click(); await expect(editor).toHaveValue('**Hello world**');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await editor.press('Control+z'); await expect(editor).toHaveValue('Hello world');
  await editor.fill('1. First'); await editor.press('End'); await editor.press('Enter');
  await expect(editor).toHaveValue('1. First\n2. ');
  await undo(page).click(); await expect(editor).toHaveValue('1. First');
  await editor.press('Control+y'); await expect(editor).toHaveValue('1. First\n2. ');
  await editor.pressSequentially('Second');
  await expect(redo(page)).toBeDisabled();
});

test('undo preserves note organization and newer typing survives a failed save', async ({page}) => {
  const editor = await open(page);
  await editor.fill('Body change');
  await page.getByRole('button',{name:'Pin note',exact:true}).click();
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await undo(page).click();
  await expect(editor).not.toHaveValue('Body change');
  await expect(page.getByRole('button',{name:'Unpin note',exact:true})).toBeVisible();
  await redo(page).click(); await expect(editor).toHaveValue('Body change');
  await page.evaluate(() => { (window as any).notesDemo.saveFails = true; });
  await editor.fill('Unsaved change');
  await page.getByRole('button',{name:'Save now'}).click();
  await expect(page.getByText('Demo connection interrupted')).toBeVisible();
  await undo(page).click(); await expect(editor).toHaveValue('Body change');
  await redo(page).click(); await expect(editor).toHaveValue('Unsaved change');
});

test('switching notes and receiving remote content reset history', async ({page}) => {
  const editor = await open(page);
  await editor.fill('Locally saved');
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await page.evaluate(async () => {
    const key = 'tend-notes:demo-documents';
    const docs = JSON.parse(localStorage.getItem(key)!);
    docs[0].content = 'Remote replacement';
    docs[0].revision = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(docs[0].content)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(key,JSON.stringify(docs));
  });
  await expect(editor).toHaveValue('Remote replacement',{timeout:10000});
  await expect(undo(page)).toBeDisabled();
  await editor.fill('Another change');
  await page.getByRole('complementary').getByRole('button',{name:'Quick capture',exact:true}).click();
  await expect(editor).toHaveValue('');
  await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
});

test('inserted media is one reversible step without removing its surrounding writing', async ({page}) => {
  const editor = await open(page);
  await editor.fill('My note'); await editor.press('End');
  await page.getByRole('button',{name:'Insert YouTube video',exact:true}).click();
  await page.getByLabel('YouTube link').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('dialog').getByRole('button',{name:'Insert link',exact:true}).click();
  const inserted = await editor.inputValue();
  expect(inserted).toContain('https://youtu.be/dQw4w9WgXcQ');
  await undo(page).click(); await expect(editor).toHaveValue('My note');
  await redo(page).click(); await expect(editor).toHaveValue(inserted);
});

test('composition updates form one undo step and native history input uses the same stack', async ({page}) => {
  const editor = await open(page);
  await editor.fill('');
  await editor.dispatchEvent('compositionstart');
  for (const value of ['n', 'ni', '你']) {
    await editor.evaluate((node, value) => {
      const field = node as HTMLTextAreaElement;
      field.setSelectionRange(0,field.value.length);
      field.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertCompositionText',isComposing:true,data:value}));
      field.value = value; field.setSelectionRange(value.length,value.length);
      field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',isComposing:true,data:value}));
    }, value);
  }
  await editor.dispatchEvent('compositionend');
  await undo(page).click(); await expect(editor).toHaveValue('');
  await redo(page).click(); await expect(editor).toHaveValue('你');
  await editor.evaluate(node => node.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'historyUndo',cancelable:true})));
  await expect(editor).toHaveValue('');
  await editor.evaluate(node => {
    node.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'historyRedo',cancelable:false}));
    (node as HTMLTextAreaElement).value = 'stale native history';
    node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'historyRedo'}));
  });
  await expect(editor).toHaveValue('你');
});
