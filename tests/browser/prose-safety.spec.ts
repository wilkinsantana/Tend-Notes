import {test,expect} from '@playwright/test';
test('table repair is saved, breaks rejected, and native table wrapper scrolls',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const surfacePath='/src/proseWritingSurface.ts';const documentPath='/src/richDocument.ts';
  const {WritingSurface}=await import(/* @vite-ignore */surfacePath);
  const {RichDocument}=await import(/* @vite-ignore */documentPath);
  const parent=document.createElement('div');document.body.append(parent);let changes=0;
  const surface=new WritingSurface(parent,{body:'Hello',onChange:()=>changes++,onUndo:()=>{},onRedo:()=>{}});
  const richSchema=surface.view.state.schema;
  const cell=()=>richSchema.nodes.table_cell.createAndFill();
  const row=(n:number)=>richSchema.nodes.table_row.create(null,Array.from({length:n},cell));
  const table=richSchema.nodes.table.create(null,[row(2),row(1)]);
  const tr=surface.view.state.tr.insert(0,table);
  surface.view.dispatch(tr);
  const actual=surface.view.state.doc;const parsed=new RichDocument(surface.body).doc;
  const repaired=actual.firstChild.child(1).childCount===2&&parsed.firstChild.child(1).childCount===2;
  const wrapper=!!parent.querySelector('.tableWrapper');
  const before=surface.body;const count=changes;
  surface.view.dispatch(surface.view.state.tr.insert(4,richSchema.nodes.hard_break.create()));
  const rejected=surface.body===before&&changes===count;
  surface.destroy();parent.remove();return {repaired,wrapper,rejected};
 });
 expect(result).toEqual({repaired:true,wrapper:true,rejected:true});
});
test('task checkbox, Enter continuation, checklist and link commands stay semantic',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{
  const path='/src/proseWritingSurface.ts';const {WritingSurface}=await import(/* @vite-ignore */path);
  const parent=document.createElement('div');parent.id='task-probe';document.body.append(parent);
  const surface=new WritingSurface(parent,{body:'- [x] Done',onChange:()=>{},onUndo:()=>{},onRedo:()=>{}});
  (window as any).taskSurface=surface;
 });
 await page.locator('#task-probe input').uncheck();
 expect(await page.evaluate(()=>(window as any).taskSurface.body)).toContain('[ ] Done');
 await page.evaluate(()=>{const s=(window as any).taskSurface;s.select(s.body.length);s.focus();});
 await page.keyboard.press('Enter');await page.keyboard.type('Next');
 expect(await page.evaluate(()=>(window as any).taskSurface.body)).toContain('[ ] Next');
 const result=await page.evaluate(()=>{
  const s=(window as any).taskSurface;s.setBody('Plain');s.select(0,5);s.checklist();const checklist=s.body;
  s.setBody('Link');s.select(0,4);const linked=s.setLink('https://example.org');const body=s.body;s.destroy();document.querySelector('#task-probe')?.remove();return {checklist,linked,body};
 });
 expect(result.checklist).toContain('[ ] Plain');expect(result.linked).toBe(true);expect(result.body).toContain('[Link](https://example.org)');
});
test('typing across a trailing table-cell space retains the same cell',async({page})=>{
 await page.goto('/');await page.evaluate(async()=>{
  const path='/src/proseWritingSurface.ts';const {WritingSurface}=await import(/* @vite-ignore */path);
  const parent=document.createElement('div');parent.id='table-probe';document.body.append(parent);
  (window as any).tableSurface=new WritingSurface(parent,{body:'| A | B |\n| --- | --- |\n| First | Second |',onChange:()=>{},onUndo:()=>{},onRedo:()=>{}});
 });
 await page.locator('#table-probe td').first().click();await page.keyboard.press('End');await page.keyboard.type(' edited');
 await expect(page.locator('#table-probe td').first()).toContainText('First edited');
 await page.evaluate(()=>{(window as any).tableSurface.destroy();document.querySelector('#table-probe')?.remove();});
});
test('upstream input rules run before the typing history adapter',async({page})=>{
 await page.goto('/');await page.evaluate(async()=>{
  const path='/src/proseWritingSurface.ts';const {WritingSurface}=await import(/* @vite-ignore */path);
  const parent=document.createElement('div');parent.id='rules-probe';document.body.append(parent);
  const s=new WritingSurface(parent,{body:'',onChange:()=>{},onUndo:()=>{},onRedo:()=>{}});(window as any).rulesSurface=s;s.focus();
 });
 await page.keyboard.type('# Heading');await expect(page.locator('#rules-probe h1')).toHaveText('Heading');
 await page.evaluate(()=>{const s=(window as any).rulesSurface;s.setBody('');s.focus();});
 await page.keyboard.type('- item');await expect(page.locator('#rules-probe ul li')).toContainText('item');
 await page.evaluate(()=>{(window as any).rulesSurface.destroy();document.querySelector('#rules-probe')?.remove();});
});
