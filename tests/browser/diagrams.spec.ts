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

// ---- Privacy: a diagram must never make the reader's browser fetch an address the note author chose. ----
const EVIL = /evil\.example/;
async function watchEvil(page:Page){
  const hits:string[]=[];
  await page.route(EVIL,route=>{hits.push(route.request().url());void route.fulfill({status:200,contentType:'image/png',body:''});});
  return hits;
}
/** Everything in the drawn SVG that could fetch: remote url(), @import, image-set, or a link that is not a fragment. */
const audit=(page:Page)=>page.locator('.rendered-markdown .notes-diagram').evaluateAll(figures=>{
  const found:string[]=[];
  const risky=/url\(\s*["']?(?!#)|@import|image-set|evil\.example/i;
  for(const figure of figures) for(const node of figure.querySelectorAll('*')){
    for(const attr of node.attributes){
      if(/^href$|:href$/i.test(attr.name)){ if(!attr.value.trim().startsWith('#')) found.push(`${node.localName}@${attr.name}=${attr.value}`); }
      else if(risky.test(attr.value)) found.push(`${node.localName}@${attr.name}=${attr.value}`);
      if(/^on/i.test(attr.name)) found.push(`${node.localName}@${attr.name}`);
    }
    if(node.localName==='style'&&risky.test(node.textContent??'')) found.push(`style=${node.textContent}`);
  }
  return found;
});
const styleText=(page:Page)=>page.locator('.rendered-markdown .notes-diagram svg style').evaluateAll(nodes=>nodes.map(node=>node.textContent).join('\n'));
async function preview(page:Page,body:string,count=1){
  await open(page,body);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.rendered-markdown .notes-diagram svg')).toHaveCount(count,{timeout:20000});
}

test('themeCSS cannot make the browser fetch a remote url from the diagram style',async({page})=>{
  const hits=await watchEvil(page);
  await preview(page,'```mermaid\n%%{init: {"themeCSS": "text{mask-image:url(https://evil.example/b)}"}}%%\ngraph TD\n  A --> B\n```');
  // Mermaid draws into the live page, so the directive is reduced before Mermaid reads it: nothing is fetched while drawing.
  expect(await styleText(page)).not.toContain('mask-image');
  expect(await audit(page)).toEqual([]);
  await page.waitForTimeout(500);
  expect(hits).toEqual([]);
});

test('quoted, @import, escaped, image-set and attribute-carried references are neutralised too',async({page})=>{
  const hits=await watchEvil(page);
  const directive=(init:object)=>`\`\`\`mermaid\n%%{init: ${JSON.stringify(init)}}%%\ngraph TD\n  A --> B\n\`\`\``;
  const css=[
    ".node rect{background-image:url('https://evil.example/c')}",
    '.node rect{background-image:url("https://evil.example/c2")}',
    '@import url(https://evil.example/d.css); text{fill:red}',
    'text{mask-image:\\75\\72\\6c(https://evil.example/e)}',
    'text{mask-image:u\\72l("\\68ttps://evil.example/e2")}',
    '.node rect{background:image-set("https://evil.example/g" 1x)}',
    '.node rect{background:-webkit-image-set(url(https://evil.example/g2) 1x)}',
  ];
  const frontMatter='```mermaid\n---\ntitle: Plan\nconfig:\n  themeCSS: "text{mask-image:url(https://evil.example/fm)}"\n---\ngraph TD\n  A --> B\n```';
  const nodeImage='```mermaid\ngraph TD\n  A@{ img: "https://evil.example/n.png", label: "x", w: 60, h: 60 }\n  A --> B\n```';
  const bodies=[...css.map(themeCSS=>directive({themeCSS})),frontMatter,
    "```mermaid\n%%{init: {'themeCSS': 'text{mask-image:url(https://evil.example/q)}'}}%%\ngraph TD\n  A --> B\n```",
    nodeImage,directive({fontFamily:'x;background:url(https://evil.example/f)'}),
    directive({themeVariables:{lineColor:'red;background:url(https://evil.example/h)'}})];
  await open(page,bodies.join('\n\n'));
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.rendered-markdown .notes-diagram svg')).toHaveCount(bodies.length,{timeout:30000});
  expect(await audit(page)).toEqual([]);
  await page.waitForTimeout(500);
  expect(hits).toEqual([]);
});

test('the sanitiser scrubs style and presentation attributes and non-fragment links',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    // Mermaid's own parser refuses most of these, so feed the sanitiser directly.
    const path='/src/diagram.ts';
    const {cleanSvg}=await import(path);
    return cleanSvg('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><marker id="m"><path d="M0 0"/></marker></defs><rect style="mask-image:url(https://evil.example/1);fill:url(#g)" fill="url(https://evil.example/2)" marker-end="url(#m)"/><rect style="mask-image:\\75rl(&quot;https://evil.example/4&quot;)"/><linearGradient id="g1" href="https://evil.example/3"/><pattern id="p1" xlink:href="//evil.example/5"/><linearGradient id="g2" href="#ok"/><style>@import url(https://evil.example/6); a{fill:url(https://evil.example/7)} b{fill:url(#g)}</style></svg>') as string;
  });
  expect(result).not.toMatch(EVIL);
  expect(result).toContain('fill:url(#g)');
  expect(result).toContain('marker-end="url(#m)"');
  expect(result).toContain('href="#ok"');
  expect(result).toContain('b{fill:url(#g)}');
});

test('a legitimate url(#marker) arrowhead still renders and resolves inside the document',async({page})=>{
  await preview(page,flow);
  const markers=await page.locator('.rendered-markdown .notes-diagram svg [marker-end], .rendered-markdown .notes-diagram svg [style*="marker-end"]').evaluateAll(nodes=>nodes.map(node=>{
    const value=node.getAttribute('marker-end')??node.getAttribute('style')??'';
    const id=/url\(\s*["']?#([^"')\s]+)/.exec(value)?.[1]??'';
    return {id,found:!!id&&!!document.getElementById(id)};
  }));
  expect(markers.length).toBeGreaterThan(0);
  expect(markers.every(marker=>marker.found)).toBe(true);
  expect(await audit(page)).toEqual([]);
});

test('the same diagram twice gets distinct element ids and both arrowheads resolve',async({page})=>{
  const twice='```mermaid\ngraph TD\n  A --> B\n```\n\nBetween\n\n```mermaid\ngraph TD\n  A --> B\n```';
  await preview(page,twice,2);
  const ids=await page.locator('.rendered-markdown [id]').evaluateAll(nodes=>nodes.map(node=>node.id));
  expect(new Set(ids).size).toBe(ids.length);
  const unresolved=await page.locator('.rendered-markdown .notes-diagram svg [marker-end]').evaluateAll(nodes=>nodes.filter(node=>{
    const id=/url\(\s*["']?#([^"')\s]+)/.exec(node.getAttribute('marker-end')??'')?.[1]??'';
    return !(node as SVGElement).ownerSVGElement?.querySelector(`[id="${id}"]`);
  }).length);
  expect(unresolved).toBe(0);
});

test('an init directive cannot loosen the security level or switch on HTML labels',async({page})=>{
  const dialogs:string[]=[]; page.on('dialog',d=>{dialogs.push(d.message());void d.dismiss();});
  await preview(page,'```mermaid\n%%{init: {"securityLevel":"loose","flowchart":{"htmlLabels":true},"htmlLabels":true}}%%\ngraph TD\n  A["<img src=x onerror=alert(1)>hi"] --> B["<b onclick=alert(2)>bold</b>"]\n  click A call alert(3)\n```');
  expect(await page.locator('.rendered-markdown .notes-diagram foreignObject').count()).toBe(0);
  expect(await page.locator('.rendered-markdown .notes-diagram img, .rendered-markdown .notes-diagram a, .rendered-markdown .notes-diagram script').count()).toBe(0);
  expect(await audit(page)).toEqual([]);
  expect(dialogs).toEqual([]);
});

test('past a shared size budget the remaining diagrams stay as code with a plain note',async({page})=>{
  const filler=`%% ${'x'.repeat(14990)}`;
  const block=(name:string)=>`\`\`\`mermaid\n${filler}\ngraph TD\n  ${name} --> Z\n\`\`\``;
  await open(page,['A','B','C','D','E'].map(block).join('\n\n'));
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.rendered-markdown .notes-diagram svg')).toHaveCount(3,{timeout:30000});
  const notes=page.locator('.rendered-markdown .notes-diagram-error');
  await expect(notes).toHaveCount(2);
  await expect(notes.first()).toHaveText('This note has too many diagrams to draw at once.');
  await expect(page.locator('.rendered-markdown pre[data-notes-diagram]:visible')).toHaveCount(2);
});

test('a shared guest note draws diagrams through the same sanitiser',async({page})=>{
  const hits=await watchEvil(page);
  await page.goto('/');
  const body='```mermaid\n%%{init: {"themeCSS": "text{mask-image:url(https://evil.example/b)}"}}%%\ngraph TD\n  A[Start] --> B[Done]\n```';
  await page.evaluate(async content=>{
    const modulePath='/src/index.ts';
    const {mountShared}=await import(modulePath);
    const state={name:'Shared plan.md',content,documentId:'shared-1',permission:'view',allowAttachments:false,status:'saved',error:null,canUndo:false,canRedo:false,participants:[]};
    const host={version:1 as const,subscribe(listener:(s:typeof state)=>void){listener({...state});return ()=>{};},edit(){},undo(){},redo(){},beginComposition(){},endComposition(){},presence(){},async upload(){throw Error('no');},async readAttachment(){return new Blob([]);}};
    const root=document.createElement('div'); root.style.height='720px'; document.body.replaceChildren(root);
    await mountShared(host,root);
  },body);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.rendered-markdown .notes-diagram svg')).toHaveCount(1,{timeout:20000});
  await expect(page.locator('.rendered-markdown .notes-diagram svg')).toContainText('Start');
  expect(await styleText(page)).not.toContain('mask-image');
  expect(await audit(page)).toEqual([]);
  await page.waitForTimeout(500);
  expect(hits).toEqual([]);
});

test('theme changes during a render fold into follow-up passes instead of starting duplicate draws',async({page})=>{
  const chain='```mermaid\ngraph LR\n'+Array.from({length:120},(_,i)=>`  N${i}[Step ${i}] --> N${i+1}[Step ${i+1}]`).join('\n')+'\n```'; // slow enough that changes land mid-render
  await preview(page,chain);
  await page.evaluate(()=>{
    (window as any).renders=0;
    // Mermaid measures inside a temporary container named d<id>; one container is one render.
    new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if((node as Element).id?.startsWith('dnotes-diagram'))(window as any).renders++;}).observe(document.body,{childList:true});
  });
  const shades=['#ffffff','#f4f4f4','#eaeaea','#e0e0e0','#d6d6d6','#cccccc'];
  for(const shade of shades){await theme(page,shade,'#1b2420');await page.waitForTimeout(20);}
  await expect.poll(()=>page.evaluate(()=>(window as any).renders),{timeout:10000}).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>(window as any).renders)).toBeLessThan(shades.length); // without the guard every change starts its own draw
  await expect(page.locator('.rendered-markdown .notes-diagram svg')).toHaveCount(1);
});
