import {test,expect} from '@playwright/test';
async function editor(page:any){await page.goto('/');await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();return page.getByRole('textbox',{name:'Note Markdown'});}

test('Markdown shortcuts format selections and stop handled keys reaching the host',async({page})=>{
 const field=await editor(page);
 await page.evaluate(()=>{(window as any).hostKeys=0;document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='b')(window as any).hostKeys++;});});
 for(const [chord,result] of [['Control+b','**word**'],['Control+i','*word*'],['Control+Shift+x','~~word~~'],['Control+e','`word`'],['Control+k','[word](https://)'],['Control+Shift+7','1. word'],['Control+Shift+8','- word'],['Control+Shift+9','> word'],['Control+Alt+2','## word']]){
  await field.fill('word');await field.selectText();await field.press(chord);await expect(field).toHaveValue(result);
 }
 await field.dispatchEvent('keydown',{key:'b',code:'KeyB',ctrlKey:true,repeat:true,bubbles:true,cancelable:true});
 await expect(field).toHaveValue('## word');
 expect(await page.evaluate(()=>(window as any).hostKeys)).toBe(0);
 await field.fill('word');await field.selectText();await field.press('Meta+b');await expect(field).toHaveValue('**word**');
 await field.press('Meta+z');await expect(field).toHaveValue('word');
});

test('shortcuts leave sibling apps, search fields, dialogs and reserved modifiers alone',async({page})=>{
 const field=await editor(page);await field.fill('original');
 await page.evaluate(()=>{const input=document.createElement('textarea');input.setAttribute('aria-label','Other app editor');document.body.append(input);(window as any).outsidePrevented=null;input.addEventListener('keydown',e=>queueMicrotask(()=>(window as any).outsidePrevented=e.defaultPrevented));});
 const outside=page.getByRole('textbox',{name:'Other app editor'});await outside.fill('outside');await outside.press('Control+b');await expect(field).toHaveValue('original');expect(await page.evaluate(()=>(window as any).outsidePrevented)).toBe(false);
 await page.getByRole('button',{name:'Rename current note'}).click();const dialog=page.getByRole('dialog');const input=dialog.locator('input');await input.fill('Rename draft');await input.press('Control+b');await expect(input).toHaveValue('Rename draft');await expect(field).toHaveValue('original');await input.press('Escape');
 await field.focus();await field.press('Control+Alt+b');await expect(field).toHaveValue('original');
 await page.getByRole('button',{name:'Search notes',exact:true}).click();const search=page.getByRole('textbox',{name:'Search your notes'});await search.fill('query');await search.press('Control+i');await expect(search).toHaveValue('query');await expect(field).toHaveValue('original');
});

test('rich editor uses the same shortcuts without double formatting',async({page})=>{
 const field=await editor(page);await field.fill('word');await page.getByRole('button',{name:'Rich text writing',exact:true}).click();const rich=page.getByRole('textbox',{name:'Rich text editor'});await rich.focus();await rich.press('Control+a');await rich.press('Control+b');await expect(rich.locator('strong')).toHaveText('word');
 await rich.press('Control+Shift+x');await expect(rich.locator('s')).toHaveText('word');
 await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();await expect(field).toHaveValue(/\*\*/);
 await page.getByRole('button',{name:'Notes guide',exact:true}).click();await page.getByRole('button',{name:'Keyboard shortcuts',exact:true}).click();await expect(page.getByRole('heading',{name:'Keep your hands on the keyboard'})).toBeVisible();
});
