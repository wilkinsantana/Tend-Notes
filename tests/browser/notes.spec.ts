import { test, expect } from '@playwright/test';

test('create, save, recover, search inside text, safe preview and focus', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'New note',exact:true}).click();
  await page.getByLabel('Note name').fill('Project journal');
  await page.getByRole('button',{name:'Create note',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('# Project journal\n\nA searchable ultramarine idea.\n\n<img src=x onerror="window.compromised=1">\n\n[bad](javascript:alert(1))');
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.preview img')).toHaveCount(0);
  await expect(page.locator('.preview a[href^="javascript"]')).toHaveCount(0);
  expect(await page.evaluate(()=>('compromised' in window))).toBe(false);
  await page.getByRole('button',{name:'Focus mode',exact:true}).click();
  await expect(page.locator('aside')).toBeHidden();
  await expect(editor).toBeVisible();
  await page.getByRole('button',{name:'Exit focus mode',exact:true}).click();
  await page.getByRole('button',{name:'Search notes',exact:true}).click();
  await page.getByRole('textbox',{name:'Search your notes'}).fill('ultramarine');
  await expect(page.locator('.note')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button',{name:/Project journal.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(editor).toHaveValue(/ultramarine/);
});

test('narrow panel and onboarding handoff', async ({page}) => {
  await page.setViewportSize({width:390,height:780}); await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toBeVisible();
  await expect(page.locator('aside')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button',{name:'Back to notes'}).click();
  await expect(page.locator('aside')).toBeVisible();
  await page.setViewportSize({width:1100,height:800}); await page.goto('/?empty');
  await expect(page.getByRole('button',{name:'Set up your notebook'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Open Files'})).toHaveCount(0);
});

test('a populated notebook continues the most recently modified loaded note in wide and narrow panels', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('tend-notes:demo-documents',JSON.stringify([
    {id:'older',libraryId:'personal',name:'Alpha.md',modifiedAt:10,size:12,content:'# Older note',revision:'older'},
    {id:'recent',libraryId:'personal',name:'Zulu.md',modifiedAt:20,size:13,content:'# Recent note',revision:'recent'},
  ])));
  await page.setViewportSize({width:1100,height:800}); await page.goto('/');
  await expect(page.locator('.welcome').getByRole('button',{name:'Continue writing',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sort notes',exact:true}).click();
  await page.getByRole('button',{name:'Title A–Z',exact:true}).click();
  await page.locator('.welcome').getByRole('button',{name:'Continue writing',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await expect(editor).toHaveValue('# Recent note'); await expect(editor).toBeFocused();
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await page.setViewportSize({width:390,height:780}); await page.getByRole('button',{name:'Back to notes'}).click();
  await page.locator('.continue-writing').click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(editor).toHaveValue('# Recent note'); await expect(editor).toBeFocused();
});

test('an empty active notebook keeps the first-note welcome', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('tend-notes:demo-documents','[]'));
  await page.goto('/');
  const welcome=page.locator('.welcome');
  await expect(welcome.getByRole('button',{name:'Write your first note',exact:true})).toBeVisible();
  await expect(welcome.getByRole('button',{name:'Continue writing',exact:true})).toHaveCount(0);
  await expect(welcome.getByRole('button',{name:'Quick capture',exact:true})).toHaveCount(0);
});

test('an empty filtered list does not mistake a populated notebook for first-note onboarding', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:'Search notes',exact:true}).click();
  await page.getByRole('textbox',{name:'Search your notes'}).fill('not a saved note');
  const welcome=page.locator('.welcome');
  await expect(welcome.getByText('No notes match these filters.')).toBeVisible();
  await expect(welcome.getByRole('button',{name:'Write your first note',exact:true})).toHaveCount(0);
  await welcome.getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(welcome.getByRole('button',{name:'Continue writing',exact:true})).toBeVisible();
});

test('quick capture focuses an untitled editor from its welcome action and shortcut, then survives reload', async ({page}) => {
  await page.goto('/');
  await page.locator('.welcome').getByRole('button',{name:'Quick capture',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await expect(editor).toBeFocused(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await editor.fill('A captured thought'); await expect(page.getByRole('button',{name:'All changes saved',exact:true})).toBeVisible();
  await page.evaluate(()=>{const docs=JSON.parse(localStorage.getItem('tend-notes:demo-documents')!); docs[0].modifiedAt=0; localStorage.setItem('tend-notes:demo-documents',JSON.stringify(docs));});
  await page.reload(); await page.locator('.welcome').getByRole('button',{name:'Continue writing',exact:true}).click();
  await expect(editor).toHaveValue('A captured thought');
  await page.getByRole('region',{name:'TEND Notes'}).focus(); await page.keyboard.press('Control+Shift+N');
  await expect(editor).toBeFocused(); await expect(editor).toHaveValue('');
});

test('a quick capture can use its first line as a title after autosave without changing its writing', async ({page}) => {
  await page.goto('/'); await page.locator('.welcome').getByRole('button',{name:'Quick capture',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('## A durable title\n\nThis saved body stays exactly as written.');
  await expect(page.getByRole('button',{name:'All changes saved',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Use first line as title',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Rename note',exact:true});
  await expect(dialog.getByLabel('Note name',{exact:true})).toHaveValue('A durable title');
  await dialog.getByRole('button',{name:'Save name',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A durable title',exact:true})).toBeVisible();
  await expect(editor).toHaveValue('## A durable title\n\nThis saved body stays exactly as written.');
  await expect(page.getByRole('button',{name:'All changes saved',exact:true})).toBeVisible();
});

test('a quick capture offers a sanitized first-line title without risking content on a conflicting rename', async ({page}) => {
  await page.setViewportSize({width:390,height:780}); await page.goto('/'); await page.getByRole('complementary').getByRole('button',{name:'Quick capture',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('#  Local title stays as writing\n\nThe body must stay put.');
  await expect(page.getByRole('button',{name:'All changes saved',exact:true})).toBeVisible();
  const suggestion=page.getByRole('button',{name:'Use first line as title',exact:true});
  await expect(suggestion).toBeVisible();
  expect(await page.locator('header').evaluate(header=>header.scrollWidth<=header.clientWidth+1)).toBe(true);
  await page.evaluate(async()=>{
    const key='tend-notes:demo-documents'; const docs=JSON.parse(localStorage.getItem(key)!);
    const note=docs.at(-1); note.content='Remote title';
    note.revision=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(note.content)))].map(value=>value.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(key,JSON.stringify(docs));
  });
  await suggestion.click();
  const dialog=page.getByRole('dialog',{name:'Rename note',exact:true});
  await expect(dialog.getByLabel('Note name',{exact:true})).toHaveValue('Local title stays as writing');
  await dialog.getByRole('button',{name:'Save name',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('changed elsewhere');
  await expect(editor).toHaveValue('#  Local title stays as writing\n\nThe body must stay put.');
});

test('a failed save cannot switch away from an editable draft', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.evaluate(()=>{(window as any).notesDemo.saveFails=true; Storage.prototype.setItem=function(){throw new Error('quota');};});
  const editor=page.getByRole('textbox',{name:'Note Markdown'}); await editor.fill('Keep this unsaved thought');
  await page.getByRole('button',{name:'Save now'}).click();
  await expect(page.getByText('Demo connection interrupted')).toBeVisible();
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(editor).toHaveValue('Keep this unsaved thought'); await expect(editor).toBeEditable();
});

test('two tabs refresh saved content and keep conflicting drafts', async ({page,context}) => {
  await page.goto('/'); const other=await context.newPage(); await other.goto('/');
  for(const tab of [page,other]) {await tab.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await tab.getByRole('button',{name:'Edit Markdown',exact:true}).click();}
  await page.getByRole('textbox',{name:'Note Markdown'}).fill('A note from the first device');
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await other.bringToFront();
  await expect(other.getByRole('textbox',{name:'Note Markdown'})).toHaveValue('A note from the first device',{timeout:10000});
  // Polls never replace dirty content. Backend revisions remain the save gate.
  await other.evaluate(()=>{(window as any).notesDemo.saveFails=true;});
  await other.getByRole('textbox',{name:'Note Markdown'}).fill('A private draft');
  await page.bringToFront(); await page.getByRole('textbox',{name:'Note Markdown'}).fill('A newer saved version');
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await other.bringToFront(); await other.evaluate(()=>{(window as any).notesDemo.saveFails=false;});
  await other.getByRole('button',{name:/Not saved|Save now/}).click();
  await expect(other.getByRole('button',{name:'Save as new note'})).toBeVisible();
  await expect(other.getByRole('textbox',{name:'Note Markdown'})).toHaveValue('A private draft');
});

test('duplicated client state still gets separate recovery keys', async ({page,context}) => {
  await page.goto('/'); await page.evaluate(()=>sessionStorage.setItem('tend-notes:client','copied-tab'));
  const second=await context.newPage(); await second.addInitScript(()=>sessionStorage.setItem('tend-notes:client','copied-tab')); await second.goto('/');
  for(const tab of [page,second]) {
    await tab.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await tab.getByRole('button',{name:'Edit Markdown',exact:true}).click();
    await tab.evaluate(()=>{(window as any).notesDemo.saveFails=true;});
    await tab.getByRole('textbox',{name:'Note Markdown'}).fill(tab===page?'first draft':'second draft');
  }
  const values=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('tend-notes:v1:demo-user:')).map(k=>JSON.parse(localStorage.getItem(k)!).content));
  expect(values.sort()).toEqual(['first draft','second draft']);
});

test('notebook switching flushes newer typing and freezes transition edits', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.evaluate(()=>{(window as any).notesDemo.saveDelay=700;});
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('First captured version'); await page.getByRole('button',{name:'Save now'}).click();
  await editor.fill('Newer typing before switching');
  await page.getByLabel('Notebook',{exact:true}).selectOption('work');
  await expect(editor).not.toBeEditable();
  await expect(page.getByText('Make room for an idea.')).toBeVisible();
  await page.getByLabel('Notebook',{exact:true}).selectOption('personal');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(editor).toHaveValue('Newer typing before switching');
});

test('an unsaved browser recovery copy survives a reload', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.evaluate(()=>{(window as any).notesDemo.saveFails=true;});
  await page.getByRole('textbox',{name:'Note Markdown'}).fill('A thought rescued after reload');
  await page.getByRole('button',{name:'Save now'}).click();
  await expect(page.getByText('Demo connection interrupted')).toBeVisible();
  await page.reload();
  await page.locator('.recovery').getByRole('button',{name:'Small things worth keeping',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toHaveValue('A thought rescued after reload');
  await page.getByRole('button',{name:'Save now'}).click();
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
});

test('narrow existing notebook exposes setup and recovery entries', async ({page}) => {
  await page.setViewportSize({width:390,height:780}); await page.goto('/?unconnected');
  await expect(page.locator('.continue-writing')).toBeVisible();
  await expect(page.getByRole('button',{name:'Quick capture',exact:true})).toBeDisabled();
  await page.locator('.continue-writing').click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toBeVisible();
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.evaluate(()=>{(window as any).notesDemo.saveFails=true;});
  await page.getByRole('textbox',{name:'Note Markdown'}).fill('Narrow recovery');
  await page.reload(); await page.getByRole('button',{name:/Recovery copies/}).click();
  await page.locator('.recovery').getByRole('button',{name:'Small things worth keeping',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toHaveValue('Narrow recovery');
});

test('Tend color tokens update immediately without remounting or losing text', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('Keep my writing while themes change');
  const app=page.locator('.notes-app');
  // Compare rendered RGBA, independent of rgb()/color(srgb) serialization.
  const background=()=>app.evaluate(element=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d')!;
    context.fillStyle=getComputedStyle(element).backgroundColor;context.fillRect(0,0,1,1);
    return Array.from(context.getImageData(0,0,1,1).data);
  });
  await expect.poll(background).toEqual([21,27,25,255]);
  await page.getByRole('button',{name:'Preview light theme'}).click();
  await expect.poll(background).toEqual([250,251,248,255]);
  await expect(editor).toHaveValue('Keep my writing while themes change');
  await page.evaluate(()=>{document.documentElement.style.setProperty('--color-primary','#9966ff');document.documentElement.style.setProperty('--color-primary-content','#18082c');});
  await expect(page.getByRole('button',{name:'New note',exact:true})).toHaveCSS('background-color','rgb(153, 102, 255)');
  await expect(page.getByRole('button',{name:'New note',exact:true})).toHaveCSS('color','rgb(24, 8, 44)');
});


test('dialogs remain usable with host modal styles and deletion requires confirmation', async ({page}) => {
  await page.goto('/');
  // The native extension shares the host document and its framework styles.
  await page.addStyleTag({content:'.modal{visibility:hidden;pointer-events:none;position:fixed;inset:0}'});
  await page.getByRole('button',{name:'New note',exact:true}).click();
  await page.getByLabel('Note name',{exact:true}).fill('Delete me');
  await page.getByRole('button',{name:'Create note',exact:true}).click();
  await page.getByRole('textbox',{name:'Note Markdown'}).fill('A disposable test note');
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await page.getByRole('button',{name:'Delete note',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Delete note',exact:true});
  const remove=dialog.getByRole('button',{name:'Delete note',exact:true});
  await expect(dialog).toContainText('Delete me');
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(remove).toBeEnabled();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toHaveValue('A disposable test note');
  await page.getByRole('button',{name:'Delete note',exact:true}).click();
  await remove.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button',{name:/Delete me.*Markdown/})).toHaveCount(0);
});

test('tags, pins and theme-aware colors organize notes without exposing metadata in the editor', async ({page}) => {
  await page.goto('/');await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});const original=await editor.inputValue();
  await page.getByRole('button',{name:'Pin note',exact:true}).click();
  await page.getByRole('button',{name:'Organize note'}).click();
  await page.getByRole('textbox',{name:'Add tag',exact:true}).fill('Work/Ideas');
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.getByRole('button',{name:'sage note color',exact:true}).click();
  await expect(editor).toHaveValue(original);
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await page.getByRole('button',{name:'Refresh notes',exact:true}).click();
  await page.getByRole('button',{name:'Pinned notes (1)'}).click();
  await expect(page.locator('.note-list .note')).toHaveCount(1);
  await page.getByRole('button',{name:'Filter by tag',exact:true}).click();
  await page.getByRole('button',{name:'#work/ideas1',exact:true}).click();
  await page.getByRole('button',{name:'Filter note color',exact:true}).click();
  await page.getByRole('button',{name:'Sky',exact:true}).click();
  await expect(page.locator('.note-list .note')).toHaveCount(0);
  await page.getByRole('button',{name:'Filter note color',exact:true}).click();
  await page.getByRole('button',{name:'Sage',exact:true}).click();
  await expect(page.locator('.note-list .note')).toHaveCount(1);
  await page.reload();await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(page.getByRole('button',{name:'Unpin note',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(editor).toHaveValue(original);
  await page.getByRole('button',{name:'Preview light theme'}).click();
  await expect(page.locator('#notes-library option').first()).toHaveCSS('background-color','rgb(241, 244, 239)');
  await expect(page.locator('#notes-library option').first()).toHaveCSS('color','rgb(38, 62, 56)');
});

test('backup dialog offers ZIPs, connected storage, scheduling and download status on narrow screens', async ({page}) => {
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.evaluate(()=>Object.assign((window as any).notesDemo,{backupFixture:true}));
  await page.getByRole('button',{name:'Export & backups',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Export and backups'});
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Backup folder',{exact:true}).selectOption('sample-drive');
  await dialog.getByLabel('Automatic backups',{exact:true}).selectOption('1440');
  await dialog.getByRole('button',{name:'Save schedule',exact:true}).click();
  await expect(dialog.getByText('Automatic backups enabled.')).toBeVisible();
  await dialog.getByRole('button',{name:'Prepare ZIP',exact:true}).click();
  await expect(dialog.getByRole('link',{name:'Download ZIP',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Back up now',exact:true}).click();
  await expect(dialog.getByText('Verified in storage',{exact:true})).toBeVisible();
  await dialog.getByLabel('Automatic backups',{exact:true}).selectOption('0');
  await dialog.getByRole('button',{name:'Save schedule',exact:true}).click();
  await expect(dialog.getByText('Automatic backups paused.')).toBeVisible();
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});


test('notebook and backup destination setup stay inside Notes and preserve cancellation', async ({page}) => {
  await page.setViewportSize({width:390,height:780}); await page.goto('/?empty');
  await page.getByRole('button',{name:'Set up your notebook'}).click();
  const setup=page.getByRole('dialog',{name:'Set up your notebook'});
  await expect(setup.getByText('This Tend server · Recommended')).toBeVisible();
  await expect(setup.getByRole('textbox')).toHaveCount(0);
  await expect(setup.getByRole('combobox')).toHaveCount(0);
  await setup.getByRole('button',{name:'Use a different server'}).click();
  await expect(setup.getByText(/Removing or replacing this server can cause data loss/)).toBeVisible();
  await setup.getByRole('button',{name:'Start writing'}).click();
  await expect(page.getByRole('button',{name:'New note',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Export & backups',exact:true}).click();
  const backups=page.getByRole('dialog',{name:'Export and backups'});
  await backups.getByRole('button',{name:'Add backup destination'}).click();
  const destination=page.getByRole('dialog',{name:'Set up a backup destination'});
  await destination.getByLabel('Destination name').fill('My cloud copy');
  await destination.getByLabel('Storage drive').selectOption('gdrive');
  await destination.getByRole('button',{name:'Use sample destination'}).click();
  await expect(backups.getByLabel('Backup folder')).toHaveValue(/.+/);
  await expect(backups.getByRole('option',{name:'My cloud copy'})).toHaveCount(1);
  await expect(backups.getByLabel('Automatic backups',{exact:true})).toHaveValue('0');
  const selected=await backups.getByLabel('Backup folder').inputValue();
  await backups.getByRole('button',{name:'Add backup destination'}).click();
  await destination.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(backups.getByLabel('Backup folder')).toHaveValue(selected);
  await expect(page).toHaveURL(/\/\?empty$/);
});

test('preview and split render Markdown, keep code literal, and split toggles off', async ({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('# Real heading\n\n**Hello! **\n\n- One\n- Two\n\n> A quote\n\n```js\nconst sample = "**raw **";\n```');
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  await expect(page.locator('.preview h1')).toHaveText('Real heading');
  await expect(page.locator('.preview strong')).toHaveText('Hello!');
  await expect(page.locator('.preview li')).toHaveCount(2);
  await expect(page.locator('.preview blockquote')).toContainText('A quote');
  await expect(page.locator('.preview pre')).toContainText('"**raw **"');
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  await expect(page.locator('.preview')).toHaveCount(0);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.preview strong')).toHaveText('Hello!');
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await editor.fill('Hello! ');await editor.selectText();
  await page.getByRole('button',{name:'Bold',exact:true}).click();
  await expect(editor).toHaveValue('**Hello!** ');
});

test('list actions rename, pin, color and delete another note without opening it',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  const writing=await editor.inputValue();
  await page.getByRole('button',{name:'New note',exact:true}).click();
  await page.getByLabel('Note name',{exact:true}).fill('Second idea');
  await page.getByRole('button',{name:'Create note',exact:true}).click();
  await editor.fill('Keep editing this note');
  await page.getByRole('button',{name:'Color for Small things worth keeping',exact:true}).click();
  await page.getByRole('button',{name:'sky note color',exact:true}).click();
  await expect(page.locator('.note').filter({hasText:'Small things worth keeping'})).toHaveAttribute('data-note-color','sky');
  await page.getByRole('button',{name:'Pin Small things worth keeping',exact:true}).click();
  await expect(page.getByRole('button',{name:'Unpin Small things worth keeping',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Rename Small things worth keeping',exact:true}).click();
  await page.getByLabel('Note name',{exact:true}).fill('Saved thoughts');
  await page.getByRole('button',{name:'Save name',exact:true}).click();
  await expect(editor).toHaveValue('Keep editing this note');
  await expect(page.getByRole('button',{name:/Saved thoughts.*Markdown/})).toBeVisible();
  await page.getByRole('button',{name:'Rename notebook',exact:true}).click();
  await page.getByLabel('Notebook name',{exact:true}).fill('My ideas');
  await page.getByRole('button',{name:'Save name',exact:true}).click();
  await expect(page.locator('#notes-library option:checked')).toHaveText('My ideas');
  await page.getByRole('button',{name:'Delete Saved thoughts',exact:true}).click();
  await page.getByRole('dialog',{name:'Delete note',exact:true}).getByRole('button',{name:'Delete note',exact:true}).click();
  await expect(page.getByRole('button',{name:/Saved thoughts.*Markdown/})).toHaveCount(0);
  await expect(editor).toHaveValue('Keep editing this note');
  expect(writing).toContain('Small things');
});

test('media is portable, remote loads require a click, and raw HTML cannot create embeds',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('button',{name:'Insert image',exact:true}).click();
  await page.getByLabel('Media description').fill('One pixel');
  await page.getByLabel('Image file',{exact:true}).setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64')});
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await expect(editor).toHaveValue(/!\[One pixel\]\(attachments\/[a-f0-9]{64}\.png\)/);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.preview img')).toHaveAttribute('src',/^blob:/);
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await editor.fill('![Remote](https://example.com/image.png)\n\n[Film](https://youtu.be/dQw4w9WgXcQ)\n\n<iframe src="https://example.com"></iframe>\n<button data-notes-media="1">Fake</button>');
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({body:'<html>Fixture video</html>',contentType:'text/html'}));
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.preview iframe,.preview img')).toHaveCount(0);
  await expect(page.locator('.preview button')).toHaveCount(2);
  await page.getByRole('button',{name:'Load YouTube video',exact:true}).click();
  await expect(page.locator('.preview iframe')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
});

test('recording stops on close and a finished clip can be inserted as portable audio',async({browser})=>{
  const context=await browser.newContext({permissions:['microphone']});
  const page=await context.newPage();
  await page.addInitScript(()=>{
    const state={stopped:0};Object.assign(window,{recordingFixture:state});
    // A deterministic recorder fixture exercises permission/stop/upload UI.
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>({getTracks:()=>[{stop(){state.stopped++;}}]})});
    class Recorder extends EventTarget {
      static isTypeSupported(){return true;} state='inactive';mimeType='audio/webm';ondataavailable:any;onstop:any;
      start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array([26,69,223,163]),'webm fixture'],{type:this.mimeType})});setTimeout(()=>this.onstop?.(),250);}
    }
    Object.assign(window,{MediaRecorder:Recorder});
  });
  await page.goto('/');await page.locator('.note-open').first().click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('button',{name:'Insert audio',exact:true}).click();
  await page.getByRole('button',{name:'Record audio',exact:true}).click();
  await expect(page.getByRole('button',{name:/Stop recording/})).toBeVisible();
  await page.getByRole('button',{name:'Close media dialog',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).recordingFixture.stopped)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Insert audio',exact:true}).click();
  await page.getByRole('button',{name:'Record audio',exact:true}).click();
  await page.getByRole('button',{name:/Stop recording/}).click();
  await expect(page.getByRole('button',{name:/Finishing recording/})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Record audio',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Use recording',exact:true}).click();
  await expect(page.getByLabel('Note Markdown')).toHaveValue(/\[Audio note\]\(attachments\/[a-f0-9]{64}\.webm\)/);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.preview audio')).toHaveAttribute('controls','');
  await context.close();
});

test('media insertion never applies old offsets to a refreshed remote document',async({page})=>{
  await page.goto('/');await page.locator('.note-open').first().click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByLabel('Note Markdown');
  await editor.fill('Original text');await expect(page.getByRole('button',{name:'All changes saved',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Insert image',exact:true}).click();
  await page.evaluate(async()=>{
    const key='tend-notes:demo-documents';const docs=JSON.parse(localStorage.getItem(key)!);
    docs[0].content='REMOTE change must survive';docs[0].revision=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(docs[0].content)))].map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(key,JSON.stringify(docs));
  });
  await page.waitForTimeout(3300);
  await page.getByLabel('Image link',{exact:true}).fill('https://example.com/image.png');
  await page.getByRole('dialog',{name:'Insert image',exact:true}).getByRole('button',{name:'Insert link',exact:true}).click();
  await expect(editor).toHaveValue(/Original text/);
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tend-notes:demo-documents')!)[0].content)).toBe('REMOTE change must survive');
});

test('Enter continues Markdown lists, tasks and quotes, and empty markers exit', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('1. First');
  await editor.press('End'); await editor.press('Enter');
  await expect(editor).toHaveValue('1. First\n2. ');
  await editor.pressSequentially('Second'); await editor.press('Enter');
  await expect(editor).toHaveValue('1. First\n2. Second\n3. ');
  await editor.press('Enter');
  await expect(editor).toHaveValue('1. First\n2. Second\n\n');
  await editor.pressSequentially('After the list');
  await expect(page.getByRole('button',{name:'All changes saved'})).toBeVisible();
  await page.reload(); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(editor).toHaveValue('1. First\n2. Second\n\nAfter the list');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.preview .rendered-markdown > p')).toHaveText('After the list');
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  for(const [body,continued,exited] of [
    ['- Bullet','- Bullet\n- ','- Bullet\n\n'],
    ['  * Nested','  * Nested\n  * ','  * Nested\n  \n  '],
    ['- [x] Done','- [x] Done\n- [ ] ','- [x] Done\n\n'],
    ['> Quote','> Quote\n> ','> Quote\n\n'],
  ]) {
    await editor.fill(body); await editor.press('End'); await editor.press('Enter');
    await expect(editor).toHaveValue(continued); await editor.press('Enter');
    await expect(editor).toHaveValue(exited);
  }
});

test('Markdown keyboard edits preserve undo, plain newlines, code and selection', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('9. Last'); await editor.press('End'); await editor.press('Enter');
  await expect(editor).toHaveValue('9. Last\n10. ');
  await editor.press('Control+z'); await expect(editor).toHaveValue('9. Last');
  await editor.press('Control+Shift+z'); await expect(editor).toHaveValue('9. Last\n10. ');
  await editor.fill('- One'); await editor.press('End'); await editor.press('Shift+Enter');
  await expect(editor).toHaveValue('- One\n');
  await editor.fill('```md\n1. Literal'); await editor.press('End'); await editor.press('Enter');
  await expect(editor).toHaveValue('```md\n1. Literal\n');
  await editor.fill('  const count = 1;'); await editor.press('End'); await editor.press('Enter');
  await expect(editor).toHaveValue('  const count = 1;\n  ');
  await editor.fill('- First second');
  await editor.evaluate((node: HTMLTextAreaElement)=>node.setSelectionRange(7,7));
  await editor.press('Enter'); await expect(editor).toHaveValue('- First\n-  second');
});

test('mobile line-break input continues a list without handling paste or composition', async ({page}) => {
  await page.setViewportSize({width:390,height:780}); await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('- [X] Done'); await editor.press('End');
  await editor.evaluate(node=>node.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertLineBreak',bubbles:true,cancelable:true})));
  await expect(editor).toHaveValue('- [X] Done\n- [ ] ');
  const ignored=await editor.evaluate(node=>[
    node.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertLineBreak',isComposing:true,bubbles:true,cancelable:true})),
    node.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertFromPaste',data:'1. Pasted',bubbles:true,cancelable:true})),
  ]);
  expect(ignored).toEqual([true,true]);
  await expect(editor).toHaveValue('- [X] Done\n- [ ] ');
});

test('panel transparency changes canvas and sidebar without fading text or dialogs', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('Keep this draft while changing the panel background.');
  const backgroundAlpha=(selector:string)=>page.locator(selector).evaluate(element=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d')!;
    context.fillStyle=getComputedStyle(element).backgroundColor;context.fillRect(0,0,1,1);
    return context.getImageData(0,0,1,1).data[3];
  });
  expect(await backgroundAlpha('.notes-app')).toBe(255);
  expect(await backgroundAlpha('aside')).toBe(255);
  await page.locator('#app').evaluate(element=>(element as HTMLElement).style.setProperty('--tend-panel-surface-alpha','0%'));
  expect(await backgroundAlpha('.notes-app')).toBe(0);
  expect(await backgroundAlpha('aside')).toBe(0);
  expect(await editor.evaluate(element=>getComputedStyle(element).opacity)).toBe('1');
  await expect(editor).toHaveValue('Keep this draft while changing the panel background.');
  await page.getByRole('button',{name:'Preview light theme',exact:true}).click();
  expect(await backgroundAlpha('.notes-app')).toBe(0);
  await page.getByRole('button',{name:'Delete note',exact:true}).click();
  expect(await backgroundAlpha('.notes-dialog')).toBe(255);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('#app').evaluate(element=>(element as HTMLElement).style.setProperty('--tend-panel-surface-alpha','100%'));
  expect(await backgroundAlpha('.notes-app')).toBe(255);
  expect(await backgroundAlpha('aside')).toBe(255);
  await expect(editor).toHaveValue('Keep this draft while changing the panel background.');
});
