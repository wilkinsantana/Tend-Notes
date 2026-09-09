import {test,expect} from '@playwright/test';
const source=(page:any)=>page.getByRole('textbox',{name:'Note Markdown'});
const rich=(page:any)=>page.getByRole('textbox',{name:'Rich text editor'});
async function open(page:any,body:string){
 await page.goto('/');await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
 await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();await source(page).fill(body);
 await page.getByRole('button',{name:'Rich text writing',exact:true}).click();await expect(rich(page)).toBeVisible();
}
test('table cells remain rich while editing and source preserves neighboring protected math',async({page})=>{
 await open(page,'| Name | Value |\n| --- | --- |\n| First | Second |\n\n$$\nx^2\n$$');
 await expect(rich(page).locator('table')).toBeVisible();
 await rich(page).locator('td').first().click();await page.keyboard.press('End');await page.keyboard.type(' edited');
 await expect(rich(page).locator('td').first()).toContainText('edited');
 await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
 expect(await source(page).inputValue()).toContain('First edited');expect(await source(page).inputValue()).toContain('$$\nx^2\n$$');
});
test('incoming note links are discoverable and open through the notes workflow',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{
  const key='tend-notes:demo-documents';const docs=JSON.parse(localStorage.getItem(key)!);
  docs.push({...docs[0],id:'backlink-fixture',name:'Linked thoughts.md'});
  docs[1].content=`A link to [my note](tend-note:${encodeURIComponent(docs[0].id)})`;
  docs[1].revision=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(docs[1].content)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(key,JSON.stringify(docs));
 });
 await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
 await page.getByRole('button',{name:'Links to this note',exact:true}).click();
 const panel=page.getByRole('region',{name:'Links to this note'});
 await expect(panel.locator('li')).toHaveCount(1);await panel.locator('li button').click();
 const link=page.locator('.preview button[data-notes-link]');await expect(link).toBeVisible();await link.click();
 await expect(page.getByRole('button',{name:'Rename current note'})).toContainText('Small things worth keeping');
});
