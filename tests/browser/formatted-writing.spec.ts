import { test, expect, type Page } from '@playwright/test';
const toggle = (page: Page) => page.getByRole('button', { name: 'Formatted writing', exact: true });
const formatted = (page: Page) => page.getByRole('textbox', { name: 'Formatted Markdown' });
const source = (page: Page) => page.getByRole('textbox', { name: 'Note Markdown' });
const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true });
const redo = (page: Page) => page.getByRole('button', { name: 'Redo', exact: true });
async function open(page: Page, body?: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /Small things worth keeping.*Markdown/ }).click();
  if (body !== undefined) await source(page).fill(body);
  await toggle(page).click();
  await expect(formatted(page)).toBeFocused();
}
async function plain(page: Page) {
  await toggle(page).click();
  const value = await source(page).inputValue();
  await toggle(page).click();
  return value;
}

test('formatted writing shares toolbar, source, preview and typing history', async ({page}) => {
  await open(page, 'Hello');
  await formatted(page).press('Control+End');
  await page.keyboard.type(' world');
  await undo(page).click(); expect(await plain(page)).toBe('Hello');
  await redo(page).click(); expect(await plain(page)).toBe('Hello world');
  await formatted(page).press('Control+a');
  await page.getByRole('button', {name:'Bold',exact:true}).click();
  expect(await plain(page)).toBe('**Hello world**');
  await page.getByRole('button', {name:'Split view',exact:true}).click();
  await expect(page.locator('.preview strong')).toHaveText('Hello world');
  await page.getByRole('button', {name:'Preview',exact:true}).click();
  await page.getByRole('button', {name:'Edit Markdown',exact:true}).click();
  await formatted(page).press('Control+z');
  expect(await plain(page)).toBe('Hello world');
});

test('formatted Find and outline navigate actual styled lines, keeping the compact layout', async ({page}, testInfo) => {
  await page.setViewportSize({width:1000,height:720});
  await open(page, '# A quiet place\n\nKeep a thought. Another thought.\n\n'+('# Tall heading\n\nA little writing.\n\n'.repeat(30))+'## Destination\n\nFinal thought');
  await formatted(page).press('Control+Home');
  await formatted(page).press('Control+f');
  const query=page.getByRole('textbox',{name:'Find text in note'});
  await query.fill('Destination');
  await expect(page.locator('.notes-find-active')).toHaveText('Destination');
  await expect(page.locator('.notes-find-active')).toBeInViewport();
  await query.press('Escape');
  await expect(formatted(page)).toBeFocused();
  await page.getByRole('button',{name:'Note outline',exact:true}).click();
  await page.getByRole('button',{name:'A quiet place',exact:true}).click();
  await expect(formatted(page).locator('.cm-line').first()).toContainText('A quiet place');
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  await page.screenshot({path:testInfo.outputPath('formatted-split.png')});
  await page.setViewportSize({width:390,height:780});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('media insertion and mobile-style list continuation remain reversible', async ({page}) => {
  await open(page, '1. First');
  await formatted(page).press('Control+End');
  await formatted(page).evaluate(node => node.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertParagraph',bubbles:true,cancelable:true}))); 
  expect(await plain(page)).toBe('1. First\n2. ');
  await page.keyboard.type('Second');
  await page.getByRole('button',{name:'Insert YouTube video',exact:true}).click();
  await expect(formatted(page)).toHaveAttribute('aria-readonly','true');
  await page.getByLabel('YouTube link').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('dialog').getByRole('button',{name:'Insert link',exact:true}).click();
  expect(await plain(page)).toContain('https://youtu.be/dQw4w9WgXcQ');
  await undo(page).click(); expect(await plain(page)).toBe('1. First\n2. Second');
});

test('opening and changing presentation preserve original CRLF bytes without saving', async ({page}) => {
  await page.goto('/');
  const original='# Heading\r\n\r\n**Keep** these exact bytes.\r\n';
  await page.evaluate(async content => {
    const key='tend-notes:demo-documents';const docs=JSON.parse(localStorage.getItem(key)!);
    docs[0].content=content;
    docs[0].revision=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(key,JSON.stringify(docs));
    const set=Storage.prototype.setItem;
    Object.assign(window,{writingSaved:0});
    Storage.prototype.setItem=function(key,value){if(key==='tend-notes:demo-documents')(window as any).writingSaved++;return set.call(this,key,value)};
  },original);
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await toggle(page).click();
  await expect(formatted(page)).toBeVisible();
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await toggle(page).click();
  await source(page).press('Control+s');
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tend-notes:demo-documents')!)[0].content)).toBe(original);
  expect(await page.evaluate(()=>(window as any).writingSaved)).toBe(0);
  await expect(undo(page)).toBeDisabled();
});

test('failed saves keep formatted drafts and note switching isolates Undo', async ({page}) => {
  await open(page,'Saved baseline');
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await page.evaluate(()=>(window as any).notesDemo.saveFails=true);
  await formatted(page).press('Control+End'); await page.keyboard.type(' unsaved');
  await page.getByRole('button',{name:'Save now'}).click();
  await expect(page.getByText('Demo connection interrupted')).toBeVisible();
  await undo(page).click(); expect(await plain(page)).toBe('Saved baseline');
  await redo(page).click(); expect(await plain(page)).toBe('Saved baseline unsaved');
  await page.evaluate(()=>(window as any).notesDemo.saveFails=false);
  await formatted(page).press('Control+s');
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await page.getByRole('complementary').getByRole('button',{name:'Quick capture',exact:true}).click();
  await expect(formatted(page)).toBeVisible();
  await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
  expect(await plain(page)).toBe('');
});

test('formatted composition commits one reversible edit and Find survives replacing all matches', async ({page}) => {
  await open(page, '');
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition',{text:'n',selectionStart:1,selectionEnd:1});
  await cdp.send('Input.imeSetComposition',{text:'ni',selectionStart:2,selectionEnd:2});
  await cdp.send('Input.insertText',{text:'你'});
  await expect(formatted(page)).toHaveText('你');
  await undo(page).click(); expect(await plain(page)).toBe('');
  await redo(page).click(); expect(await plain(page)).toBe('你');
  await formatted(page).press('Control+f');
  await page.getByRole('textbox',{name:'Find text in note'}).fill('你');
  await expect(page.locator('.notes-find-match')).toHaveCount(1);
  await formatted(page).click(); await formatted(page).press('Control+a');
  await page.keyboard.type('New words');
  await expect(page.locator('.notes-find-match')).toHaveCount(0);
  await expect(page.getByRole('search').getByRole('status')).toHaveText('No matches');
  expect(await plain(page)).toBe('New words');
});

test('formatted code loads on demand, follows themes and preserves drafts on conflicts', async ({page}) => {
  const requested:string[]=[];
  page.on('request',request=>requested.push(request.url()));
  await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  expect(requested.some(url=>url.includes('/writingSurface.ts'))).toBe(false);
  await toggle(page).click();
  await expect(formatted(page)).toBeVisible();
  expect(requested.some(url=>url.includes('/writingSurface.ts'))).toBe(true);
  const dark=await formatted(page).evaluate(node=>getComputedStyle(node).color);
  await page.getByRole('button',{name:'Preview light theme'}).click();
  await expect.poll(()=>formatted(page).evaluate(node=>getComputedStyle(node).color)).not.toBe(dark);
  await page.evaluate(async()=>{
    const key='tend-notes:demo-documents';const docs=JSON.parse(localStorage.getItem(key)!);
    docs[0].content='A different writer';docs[0].revision=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(docs[0].content)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(key,JSON.stringify(docs));
  });
  await formatted(page).press('Control+End');await page.keyboard.type(' My retained draft');
  await formatted(page).press('Control+s');
  await expect(page.getByText('This note changed elsewhere. Keep your draft or reload the saved version.')).toBeVisible();
  expect(await plain(page)).toContain('My retained draft');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tend-notes:demo-documents')!)[0].content)).toBe('A different writer');
});
