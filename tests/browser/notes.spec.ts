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
  await page.getByRole('textbox',{name:'Search your notes'}).fill('ultramarine');
  await expect(page.locator('.note')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button',{name:/Project journal.*Markdown/}).click();
  await expect(editor).toHaveValue(/ultramarine/);
});

test('narrow panel and onboarding handoff', async ({page}) => {
  await page.setViewportSize({width:390,height:780}); await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toBeVisible();
  await expect(page.locator('aside')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button',{name:'Back to notes'}).click();
  await expect(page.locator('aside')).toBeVisible();
  await page.setViewportSize({width:1100,height:800}); await page.goto('/?empty');
  await expect(page.getByRole('link',{name:'Open Files'})).toHaveAttribute('href','#/shell/files');
});

test('a failed save cannot switch away from an editable draft', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.evaluate(()=>{(window as any).notesDemo.saveFails=true; Storage.prototype.setItem=function(){throw new Error('quota');};});
  const editor=page.getByRole('textbox',{name:'Note Markdown'}); await editor.fill('Keep this unsaved thought');
  await page.getByRole('button',{name:'Save now'}).click();
  await expect(page.getByText('Demo connection interrupted')).toBeVisible();
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await expect(editor).toHaveValue('Keep this unsaved thought'); await expect(editor).toBeEditable();
});

test('two tabs refresh saved content and keep conflicting drafts', async ({page,context}) => {
  await page.goto('/'); const other=await context.newPage(); await other.goto('/');
  for(const tab of [page,other]) await tab.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
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
    await tab.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
    await tab.evaluate(()=>{(window as any).notesDemo.saveFails=true;});
    await tab.getByRole('textbox',{name:'Note Markdown'}).fill(tab===page?'first draft':'second draft');
  }
  const values=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('tend-notes:v1:demo-user:')).map(k=>JSON.parse(localStorage.getItem(k)!).content));
  expect(values.sort()).toEqual(['first draft','second draft']);
});

test('notebook switching flushes newer typing and freezes transition edits', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.evaluate(()=>{(window as any).notesDemo.saveDelay=700;});
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('First captured version'); await page.getByRole('button',{name:'Save now'}).click();
  await editor.fill('Newer typing before switching');
  await page.getByLabel('NOTEBOOK',{exact:true}).selectOption('work');
  await expect(editor).not.toBeEditable();
  await expect(page.getByText('Make room for an idea.')).toBeVisible();
  await page.getByLabel('NOTEBOOK',{exact:true}).selectOption('personal');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await expect(editor).toHaveValue('Newer typing before switching');
});

test('an unsaved browser recovery copy survives a reload', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
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
  await expect(page.getByRole('link',{name:'Connect a notebook folder in Files'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Connect a notebook folder in Files'})).toHaveAttribute('href','#/shell/files');
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.evaluate(()=>{(window as any).notesDemo.saveFails=true;});
  await page.getByRole('textbox',{name:'Note Markdown'}).fill('Narrow recovery');
  await page.reload(); await page.getByRole('button',{name:/Recovery copies/}).click();
  await page.locator('.recovery').getByRole('button',{name:'Small things worth keeping',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toHaveValue('Narrow recovery');
});

test('Tend color tokens update immediately without remounting or losing text', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await editor.fill('Keep my writing while themes change');
  const app=page.locator('.notes-app');
  await expect(app).toHaveCSS('background-color','rgb(21, 27, 25)');
  await page.getByRole('button',{name:'Preview light theme'}).click();
  await expect(app).toHaveCSS('background-color','rgb(250, 251, 248)');
  await expect(editor).toHaveValue('Keep my writing while themes change');
  await page.evaluate(()=>{document.documentElement.style.setProperty('--color-primary','#9966ff');document.documentElement.style.setProperty('--color-primary-content','#18082c');});
  await expect(page.getByRole('button',{name:'New note',exact:true})).toHaveCSS('background-color','rgb(153, 102, 255)');
  await expect(page.getByRole('button',{name:'New note',exact:true})).toHaveCSS('color','rgb(24, 8, 44)');
});


test('dialogs remain usable with host modal styles and deletion requires the name', async ({page}) => {
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
  await expect(remove).toBeDisabled();
  await dialog.getByLabel('Type the note name to delete it').fill('Delete me');
  await remove.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button',{name:/Delete me.*Markdown/})).toHaveCount(0);
});
