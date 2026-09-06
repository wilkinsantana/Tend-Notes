import { test, expect, type Page } from '@playwright/test';
const storageKey='tend-notes:demo-documents';
async function seed(page:Page, entries:Array<{id:string;libraryId:string;name:string;content:string;canWrite?:boolean}>=[{id:'shopping',libraryId:'personal',name:'Shopping.md',content:'# Groceries\n- [ ] Milk\n- [ ] Milk\n- [x] Bread\n'},{id:'meeting',libraryId:'work',name:'Meeting.md',content:'## Actions\n- [ ] Send agenda\n\n```md\n- [ ] Example only\n```\n'}]) {
  await page.goto('/');
  await page.evaluate(async entries=>{
    const docs=[];
    for(const entry of entries){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(entry.content));docs.push({...entry,revision:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join(''),size:entry.content.length,modifiedAt:1});}
    localStorage.setItem('tend-notes:demo-documents',JSON.stringify(docs));
  },entries);
  await page.reload();
}
const docs=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('tend-notes:demo-documents')??'[]'));
async function enter(page:Page){await page.getByRole('button',{name:/^ToDo/}).click();await expect(page.getByRole('button',{name:'Refresh tasks'})).toBeEnabled();}

test('ToDo collects notebooks and edits the exact duplicate checkbox in canonical Markdown',async({page})=>{
  await seed(page); await enter(page);
  await expect(page.getByRole('heading',{name:'ToDo',exact:true})).toBeFocused();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await expect(page.getByText('Example only',{exact:true})).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Mark complete: Milk',exact:true}).nth(1).click();
  await expect(page.getByRole('checkbox',{name:'Mark complete: Milk',exact:true})).toHaveCount(1);
  expect((await docs(page)).find((d:any)=>d.id==='shopping').content).toBe('# Groceries\n- [ ] Milk\n- [x] Milk\n- [x] Bread\n');
  await page.getByRole('button',{name:'Completed',exact:true}).click();
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await page.getByRole('button',{name:'Open Shopping.md, task on line 3'}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  await expect(editor).toBeFocused();
  expect(await editor.evaluate((el:HTMLTextAreaElement)=>el.value.slice(el.selectionStart,el.selectionEnd))).toBe('x');
  await editor.fill('# Groceries\n- [ ] Milk\n- [ ] Milk\n- [x] Bread\n');
  await enter(page); await expect(page.getByRole('checkbox',{name:'Mark complete: Milk',exact:true})).toHaveCount(2);
});

test('remote reorder blocks task updates and source navigation until refresh',async({page})=>{
  await seed(page); await enter(page);
  await page.evaluate(async()=>{
    const docs=JSON.parse(localStorage.getItem('tend-notes:demo-documents')!);
    const d=docs.find((d:any)=>d.id==='shopping');d.content='- [ ] Eggs\n- [ ] Milk\n';
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(d.content));d.revision=[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
    localStorage.setItem('tend-notes:demo-documents',JSON.stringify(docs));
  });
  await page.getByRole('checkbox',{name:'Mark complete: Milk',exact:true}).first().click();
  await expect(page.getByRole('alert')).toContainText('Refresh tasks');
  await expect(page.getByRole('checkbox',{name:'Mark complete: Milk',exact:true}).first()).not.toBeChecked();
  expect((await docs(page)).find((d:any)=>d.id==='shopping').content).toBe('- [ ] Eggs\n- [ ] Milk\n');
  await page.getByRole('button',{name:'Open Shopping.md, task on line 2'}).click();
  await expect(page.getByRole('heading',{name:'ToDo',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Refresh tasks'}).click();
  await expect(page.getByRole('checkbox',{name:'Mark complete: Eggs'})).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Mark complete: Milk',exact:true})).toHaveCount(1);
});

test('failed task save stays unchecked; retry confirms before showing completion',async({page})=>{
  await seed(page); await enter(page);
  await page.evaluate(()=>{(window as any).notesDemo.saveFails=true;});
  const task=page.getByRole('checkbox',{name:'Mark complete: Send agenda'});
  await task.click(); await expect(page.getByRole('alert')).toContainText('connection interrupted');
  await expect(task).not.toBeChecked(); expect((await docs(page)).find((d:any)=>d.id==='meeting').content).toContain('- [ ] Send agenda');
  await page.evaluate(()=>{(window as any).notesDemo.saveFails=false;(window as any).notesDemo.saveDelay=1200;});
  await task.click(); await expect(task).toBeDisabled(); await expect(task).not.toBeChecked();
  await expect(page.getByRole('button',{name:'Back to Notes'})).toBeDisabled();
  await expect(task).toHaveCount(0);
  expect((await docs(page)).find((d:any)=>d.id==='meeting').content).toContain('- [x] Send agenda');
});

test('unsaved failed editor blocks ToDo and keeps its recovery copy',async({page})=>{
  await seed(page); await page.getByRole('button',{name:/Shopping.*Markdown/}).click();
  await page.evaluate(()=>{(window as any).notesDemo.saveFails=true;});
  const editor=page.getByRole('textbox',{name:'Note Markdown'});await editor.fill('My unfinished writing');
  await page.getByRole('button',{name:/^ToDo/}).click();
  await expect(page.getByRole('heading',{name:'ToDo',exact:true})).toHaveCount(0);
  await expect(editor).toHaveValue('My unfinished writing');
  expect(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('tend-notes:v1:')&&localStorage.getItem(key)?.includes('My unfinished writing')))).toBe(true);
});

test('narrow ToDo supports keyboard, search, read-only tasks, transparency and returning focus',async({page})=>{
  await page.setViewportSize({width:390,height:780});await seed(page);await page.goto('/?unconnected');
  await page.getByRole('region',{name:'TEND Notes'}).evaluate(el=>(el as HTMLElement).style.setProperty('--tend-panel-surface-alpha','0%'));
  await enter(page);await expect(page.getByRole('button',{name:'Back to Notes'})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('checkbox').first()).toBeDisabled();
  await page.getByRole('searchbox',{name:'Search tasks, notes, and notebooks'}).fill('agenda');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('button',{name:'Back to Notes'}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:/^ToDo/})).toBeFocused();
});

test('ToDo uses per-note editing permission independently of notebook creation',async({page})=>{
  await seed(page,[{id:'writable',libraryId:'personal',name:'Writable.md',content:'- [ ] Allowed\n',canWrite:true}]);
  await page.goto('/?unconnected');await enter(page);
  const allowed=page.getByRole('checkbox',{name:'Mark complete: Allowed'});
  await expect(allowed).toBeEnabled();await allowed.click();
  await expect(allowed).toHaveCount(0);
  await expect.poll(async()=>(await docs(page))[0].content).toBe('- [x] Allowed\n');

  await page.evaluate(async()=>{const items=JSON.parse(localStorage.getItem('tend-notes:demo-documents')!);items[0].content='- [ ] Blocked\n';items[0].canWrite=false;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(items[0].content));items[0].revision=[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');localStorage.setItem('tend-notes:demo-documents',JSON.stringify(items));});
  await page.goto('/');await enter(page);
  const blocked=page.getByRole('checkbox',{name:'Mark complete: Blocked'});
  await expect(blocked).toBeDisabled();
  await expect(blocked.locator('..')).toHaveAttribute('title','Editing is unavailable for this note');
});

test('late reads from a closed ToDo scan cannot change the next editor',async({page})=>{
  await seed(page);await page.evaluate(()=>{(window as any).notesDemo.readDelay=1000;});
  await page.getByRole('button',{name:/^ToDo/}).click();
  await expect(page.getByRole('button',{name:'Refresh tasks'})).toBeDisabled();
  await page.getByRole('button',{name:'Back to Notes'}).click();
  await page.evaluate(()=>{(window as any).notesDemo.readDelay=0;});
  await page.getByRole('button',{name:/Shopping.*Markdown/}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});await editor.fill('A note after cancelling task scan');
  await expect(page.getByRole('button',{name:'All changes saved',exact:true})).toBeVisible();
  await expect(editor).toHaveValue('A note after cancelling task scan');
});


test('source navigation maps CRLF and organization headers to the textarea checkbox',async({page})=>{
  const content='<!-- tend-notes {"v":1,"tags":[],"color":"none","pinned":false} -->\r\n# Café 😀\r\n- [ ] Milk\r\n';
  await seed(page,[{id:'windows',libraryId:'personal',name:'Windows.md',content}]);await enter(page);
  await page.getByRole('checkbox',{name:'Mark complete: Milk',exact:true}).click();
  await page.getByRole('button',{name:'Completed',exact:true}).click();
  expect((await docs(page))[0].content).toBe(content.replace('- [ ] Milk','- [x] Milk'));
  await page.getByRole('button',{name:'Open Windows.md, task on line 3'}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});await expect(editor).toBeFocused();
  expect(await editor.evaluate((el:HTMLTextAreaElement)=>el.value.slice(el.selectionStart,el.selectionEnd))).toBe('x');
});
