import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Run the packaged entry and worker at the same relative URLs and strict script
// policy used by the host. No Vite-transformed source or inline worker fallback.
for (const completeScan of [false, true]) {
test(completeScan ? 'packaged worker preserves all 45000 tasks with bounded rendering' : 'packaged task worker runs under self-only CSP and keeps large scans cancellable',async({page})=>{
  test.setTimeout(60000);
  const manifest=JSON.parse(readFileSync(resolve('dist/extension.json'),'utf8'));
  const violations:string[]=[];
  page.on('console',message=>{if(message.text().includes('Content Security Policy'))violations.push(message.text());});
  const bootstrap=`import {activate} from './index.js';
const large=Array.from({length:45000},(_,i)=>'- [ ] Task '+i).join('\\n');
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const doc={id:'large',libraryId:'one',name:'Large checklist.md',content:large,revision:await hash(large),size:large.length,modifiedAt:1};
window.fixtureDoc=doc;
activate({id:'host.tend.notes',user:{id:'fixture',name:'Writer',role:'user'},onUnmount(){},documents:{version:1,
 async libraries(){return [{id:'one',name:'Notebook',canCreate:true}]},async index(){return {indexed:0,skipped:0,more:false}},
 async list(){return {items:[{...doc}],total:1,nextOffset:null}},async read(){return {...doc}},
 async save(id,input){Object.assign(doc,{content:input.content,revision:await hash(input.content)});return {...doc}},
 async create(){throw Error('not used')},async delete(){throw Error('not used')}
}}).mount(document.querySelector('#app'));`;
  await page.route('**/packaged-fixture/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice('/packaged-fixture/'.length);
    const headers={'Content-Security-Policy':"default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:"};
    if(!name){await route.fulfill({headers,contentType:'text/html',body:'<!doctype html><style>body{margin:0}#app{height:100vh}</style><div id="app"></div><script type="module" src="./bootstrap.js"></script>'});return;}
    if(name==='bootstrap.js'){await route.fulfill({headers,contentType:'text/javascript',body:bootstrap});return;}
    if(!Object.hasOwn(manifest.integrity,name)||!name.endsWith('.js')){await route.fulfill({status:404,body:'Not packaged'});return;}
    await route.fulfill({headers,contentType:'text/javascript',body:readFileSync(resolve('dist',name))});
  });
  await page.goto('/packaged-fixture/');
  const workerStarted=page.waitForEvent('worker');
  await page.getByRole('button',{name:/^ToDo/}).click();
  const worker=await workerStarted;expect(worker.url()).not.toMatch(/^(blob:|data:)/);
  await expect(page.getByRole('button',{name:'Refresh tasks'})).toBeDisabled();
  // Let parsing begin, then prove timer/input dispatch remains on a responsive
  // main thread. This would stall for many seconds with the synchronous parser.
  const elapsed=await page.evaluate(()=>new Promise<number>(resolve=>{const start=performance.now();setTimeout(()=>resolve(performance.now()-start),100);}));
  expect(elapsed).toBeLessThan(2000);
  if (completeScan) {
    await expect(page.getByText('Showing 1–100 of 45000')).toBeVisible({timeout:45000});
    await expect(page.getByRole('checkbox')).toHaveCount(100);
    await page.getByRole('searchbox',{name:'Search tasks, notes, and notebooks'}).fill('Task 44999');
    await expect(page.getByRole('checkbox',{name:'Mark complete: Task 44999',exact:true})).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    expect(violations).toEqual([]);
    return;
  }
  await page.getByRole('button',{name:'Back to Notes'}).click({timeout:3000});
  await expect(page.getByRole('button',{name:/^ToDo/})).toBeFocused();
  await page.evaluate(async()=>{const doc=(window as any).fixtureDoc;doc.content='- [ ] Small task';doc.revision=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(doc.content)))].map(n=>n.toString(16).padStart(2,'0')).join('');});
  await page.getByRole('button',{name:/^ToDo/}).click();
  const task=page.getByRole('checkbox',{name:'Mark complete: Small task'});await expect(task).toBeEnabled();await task.click();
  await expect(page.getByRole('heading',{name:'Everything is complete'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).fixtureDoc.content)).toBe('- [x] Small task');
  expect(violations).toEqual([]);
});

}
