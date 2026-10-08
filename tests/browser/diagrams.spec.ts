import {test,expect,type Page} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const flow='```mermaid\ngraph TD\n  A[Start] --> B{Choice}\n  B -->|Yes| C[Do it]\n  B -->|No| D[Skip]\n```\n\nAfter the diagram.';
async function open(page:Page,body:string){
  await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('textbox',{name:'Note Markdown'}).fill(body);
}
const theme=(page:Page,paper:string,ink:string)=>page.evaluate(([p,i])=>{document.documentElement.style.setProperty('--color-base-100',p);document.documentElement.style.setProperty('--color-base-content',i);},[paper,ink]);
const background=(page:Page)=>page.locator('.rendered-markdown .notes-diagram svg').first().evaluate(svg=>{
  const rect=svg.querySelector('.node rect, .node polygon, .node path') as SVGElement|null;
  return rect?getComputedStyle(rect).fill:'';
});

for (const [name,paper,ink] of [['light','#ffffff','#1b2420'],['dark','#10161a','#e6efea']]) {
test(`a graph TD note renders an SVG diagram in the ${name} theme and keeps its source`,async({page})=>{
  await page.goto('/'); await theme(page,paper,ink);
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Note Markdown'});
  await source.fill(flow);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  const svg=page.locator('.rendered-markdown .notes-diagram svg');
  await expect(svg).toHaveCount(1,{timeout:15000});
  await expect(svg).toContainText('Choice');
  await expect(page.locator('.rendered-markdown')).toContainText('After the diagram.');
  await expect(page.locator('.rendered-markdown pre[data-notes-diagram]')).toBeHidden();
  expect(await svg.locator('script,foreignObject').count()).toBe(0);
  const fill=await background(page); expect(fill).not.toBe('');
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(source).toHaveValue(flow);
});
}

test('diagrams follow a live theme change',async({page})=>{
  await page.goto('/'); await theme(page,'#ffffff','#1b2420');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click(); await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('textbox',{name:'Note Markdown'}).fill(flow);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  const svg=page.locator('.rendered-markdown .notes-diagram svg');
  await expect(svg).toHaveCount(1,{timeout:15000});
  const light=await svg.locator('text').first().evaluate(node=>getComputedStyle(node).fill);
  await theme(page,'#10161a','#e6efea');
  await expect.poll(()=>svg.locator('text').first().evaluate(node=>getComputedStyle(node).fill),{timeout:10000}).not.toBe(light);
});

test('untagged raw Mermaid renders; ordinary code blocks stay code; split view draws too',async({page})=>{
  await open(page,'```\nflowchart LR\n  X --> Y\n```\n\n```\ngraph is a word\n```\n\n```js\ngraph TD\n```');
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  const preview=page.getByRole('region',{name:'Note preview'});
  await expect(preview.locator('.notes-diagram svg')).toHaveCount(1,{timeout:15000});
  await expect(preview.locator('pre:not([data-notes-diagram])')).toHaveCount(2);
  await expect(preview.locator('pre:not([data-notes-diagram]) code').first()).toContainText('graph is a word');
});

test('an invalid diagram keeps the code and explains the mistake; the rest of the note renders',async({page})=>{
  await open(page,'Before\n\n```mermaid\ngraph TD\n  A --> B\n  B --> {\n```\n\nAfter');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  const note=page.locator('.rendered-markdown .notes-diagram-error');
  await expect(note).toHaveText(/^This diagram has a mistake on line \d+: .+/,{timeout:15000});
  await expect(page.locator('.rendered-markdown pre[data-notes-diagram]')).toBeVisible();
  await expect(page.locator('.rendered-markdown pre[data-notes-diagram]')).toContainText('B --> {');
  await expect(page.locator('.rendered-markdown')).toContainText('Before');
  await expect(page.locator('.rendered-markdown')).toContainText('After');
  expect(await page.locator('body > [id^="dnotes-diagram"], body > svg').count()).toBe(0);
});

test('note HTML cannot smuggle script or click handlers through a diagram',async({page})=>{
  const dialogs:string[]=[]; page.on('dialog',d=>{dialogs.push(d.message());void d.dismiss();});
  await open(page,'```mermaid\ngraph TD\n  A["<img src=x onerror=alert(1)>hi"] --> B\n  click A call alert(2)\n  click B href "https://example.com"\n```');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.rendered-markdown .notes-diagram svg, .rendered-markdown .notes-diagram-error').first()).toBeVisible({timeout:15000});
  expect(await page.locator('.rendered-markdown .notes-diagram a, .rendered-markdown .notes-diagram [onclick], .rendered-markdown .notes-diagram img').count()).toBe(0);
  expect(dialogs).toEqual([]);
});

test('the Diagram button inserts a starter block that renders',async({page})=>{
  await open(page,'Intro');
  const source=page.getByRole('textbox',{name:'Note Markdown'}); await source.press('Control+End');
  await page.getByRole('button',{name:'Insert diagram',exact:true}).click();
  await expect(source).toHaveValue(/^Intro\n```mermaid\ngraph TD\n {2}A\[Start\] --> B\{Choice\}\n {2}B -->\|Yes\| C\[Do it\]\n {2}B -->\|No\| D\[Skip\]\n```\n$/);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.rendered-markdown .notes-diagram svg')).toHaveCount(1,{timeout:15000});
});

test('rich writing inserts the starter and keeps the Mermaid fence in the Markdown source',async({page})=>{
  await open(page,'Intro');
  const source=page.getByRole('textbox',{name:'Note Markdown'}); await source.press('Control+End');
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  const rich=page.getByRole('textbox',{name:'Rich text editor'}); await expect(rich).toContainText('Intro');
  await rich.press('Control+End');
  await page.getByRole('button',{name:'Insert diagram',exact:true}).click();
  await expect(rich).toContainText('graph TD');
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await expect(source).toHaveValue(/```mermaid\ngraph TD\n {2}A\[Start\] --> B\{Choice\}[\s\S]*```/);
});

// Run the built entry and every lazy chunk under the host's strict script policy: no eval, no inline script, no remote fonts.
test('packaged Mermaid chunk draws under a self-only script policy',async({page})=>{
  test.skip(!existsSync(resolve('dist/extension.json')),'run the build first');
  test.setTimeout(60000);
  const manifest=JSON.parse(readFileSync(resolve('dist/extension.json'),'utf8'));
  const violations:string[]=[], failures:string[]=[];
  page.on('console',message=>{if(/Content Security Policy|unsafe-eval/.test(message.text()))violations.push(message.text());});
  page.on('pageerror',error=>failures.push(error.message));
  const body='# Plan\n\n```mermaid\ngraph TD\n  A[Start] --> B{Choice}\n  B -->|Yes| C[Do it]\n```\n\n```mermaid\nsequenceDiagram\n  Ann->>Bob: Hello\n```\n\n```mermaid\npie title Pets\n  "Dogs" : 3\n  "Cats" : 2\n```\n\n```mermaid\ngraph TD\n  A -->\n```\n';
  const bootstrap=`import {activate} from './index.js';
const body=${JSON.stringify(body)};
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const doc={id:'one',libraryId:'one',name:'Plan.md',content:body,revision:await hash(body),size:body.length,modifiedAt:1};
activate({id:'host.tend.notes',user:{id:'fixture',name:'Writer',role:'user'},onUnmount(){},documents:{version:1,
 async libraries(){return [{id:'one',name:'Notebook',canCreate:true}]},async index(){return {indexed:0,skipped:0,more:false}},
 async list(){return {items:[{...doc}],total:1,nextOffset:null}},async read(){return {...doc}},
 async save(id,input){Object.assign(doc,{content:input.content,revision:await hash(input.content)});return {...doc}},
 async create(){throw Error('not used')},async delete(){throw Error('not used')}
}}).mount(document.querySelector('#app'));`;
  const headers={'Content-Security-Policy':"default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:"};
  await page.route('**/packaged-diagram/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice('/packaged-diagram/'.length);
    if(!name){await route.fulfill({headers,contentType:'text/html',body:'<!doctype html><style>body{margin:0}#app{height:100vh}</style><div id="app"></div><script type="module" src="./bootstrap.js"></script>'});return;}
    if(name==='bootstrap.js'){await route.fulfill({headers,contentType:'text/javascript',body:bootstrap});return;}
    if(!Object.hasOwn(manifest.integrity,name)||!name.endsWith('.js')){await route.fulfill({status:404,body:'Not packaged'});return;}
    await route.fulfill({headers,contentType:'text/javascript',body:readFileSync(resolve('dist',name))});
  });
  await page.goto('/packaged-diagram/');
  await page.getByRole('button',{name:/Plan/}).first().click();
  await expect(page.locator('.rendered-markdown .notes-diagram svg')).toHaveCount(3,{timeout:30000});
  await expect(page.locator('.rendered-markdown .notes-diagram-error')).toHaveText(/This diagram has a mistake on line \d+: /);
  expect(violations).toEqual([]); expect(failures).toEqual([]);
});
