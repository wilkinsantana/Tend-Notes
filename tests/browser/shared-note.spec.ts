import { test, expect, type Page } from '@playwright/test';

async function shared(page: Page, content = 'Starting point', permission: 'view'|'edit' = 'edit') {
  await page.goto('/');
  await page.evaluate(async ({content,permission}) => {
    const modulePath = '/src/index.ts';
    const { mountShared } = await import(modulePath);
    let current = {name:'Project plan.md',content,documentId:'shared-1',permission,allowAttachments:true,status:'saved',error:null,canUndo:true,canRedo:true,participants:[{id:'one',name:'Avery',anchor:0,head:0}],selection:undefined as {start:number;end:number}|undefined};
    const listeners = new Set<(state: typeof current) => void>();
    const emit = () => listeners.forEach(listener => listener({...current}));
    const fixture = {
      edits: [] as Array<[string,string]>, presence: [] as Array<[number,number]>, begins: 0, ends: 0, undos:0, redos:0, rejectNext: false, endContent: '',
      host: {
        version: 1 as const,
        subscribe(listener: (state: typeof current) => void) { listeners.add(listener); listener({...current}); return () => listeners.delete(listener); },
        edit(before: string, after: string) { fixture.edits.push([before,after]); if(fixture.rejectNext){fixture.rejectNext=false;throw new Error('edit rejected');}if(before !== current.content) throw new Error('stale edit'); current={...current,content:after,status:'saved',error:null}; emit(); },
        undo() {fixture.undos++;}, redo() {fixture.redos++;}, beginComposition() { fixture.begins++; }, endComposition() { fixture.ends++;if(fixture.endContent){current={...current,content:fixture.endContent};fixture.endContent='';emit();} },
        presence(anchor:number,head:number) { fixture.presence.push([anchor,head]); },
        async upload() { return {path:`attachments/${'a'.repeat(64)}.pdf`,type:'application/pdf'}; },
        async readAttachment() { return new Blob(['file']); },
      },
      remote(next: string, selection?:{start:number;end:number}) { current={...current,content:next,selection}; emit(); },
      permission(next: 'view'|'edit') { current={...current,permission:next}; emit(); },
      endWith(next:string) { fixture.endContent=next; },
    };
    (window as any).sharedFixture=fixture;
    const root=document.createElement('div'); root.style.height='720px'; document.body.replaceChildren(root);
    (window as any).sharedMount=mountShared(fixture.host,root);
  }, {content,permission});
}

test('source edits use exact prior bytes and remote updates do not feed back', async ({page}) => {
  await shared(page);
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Shared note Markdown'});
  await source.fill('Local edit');
  await expect.poll(() => page.evaluate(()=>(window as any).sharedFixture.edits)).toEqual([['Starting point','Local edit']]);
  await expect.poll(() => page.evaluate(()=>(window as any).sharedFixture.presence.at(-1))).toEqual([10,10]);
  await page.evaluate(()=>(window as any).sharedFixture.remote('Edited by another person'));
  await expect(source).toHaveValue('Edited by another person');
  await expect.poll(() => page.evaluate(()=>(window as any).sharedFixture.edits.length)).toBe(1);
});

test('composition keeps the host end state ahead of queued snapshots', async ({page}) => {
  await shared(page, 'Draft');
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Shared note Markdown'});
  await source.dispatchEvent('compositionstart');
  await source.fill('Local composition');
  await page.evaluate(() => { const fixture=(window as any).sharedFixture; fixture.remote('Older queued update'); fixture.endWith('Newer host update'); });
  await expect(source).toHaveValue('Local composition');
  await source.dispatchEvent('compositionend');
  await expect(source).toHaveValue('Newer host update');
  await expect.poll(() => page.evaluate(()=>[(window as any).sharedFixture.begins,(window as any).sharedFixture.ends])).toEqual([1,1]);
});

test('a rejected local edit remains available across later remote snapshots until explicitly resolved', async ({page}) => {
  await shared(page);
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Shared note Markdown'});
  await page.evaluate(()=>(window as any).sharedFixture.rejectNext=true);
  await source.fill('Rejected local branch');
  await expect(page.getByRole('alert')).toContainText('edit rejected');
  await page.evaluate(()=>(window as any).sharedFixture.remote('Later saved remote copy'));
  await expect(source).toHaveValue('Rejected local branch');
  await page.getByRole('button',{name:'Use shared version',exact:true}).click();
  await expect(source).toHaveValue('Later saved remote copy');
});

test('rich table editing routes through the shared host and a view-only guest cannot edit', async ({page}) => {
  await shared(page, '| A | B |\n| --- | --- |\n| one | two |');
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await page.locator('.notes-rich-editor td').first().click();
  await page.keyboard.press('Control+a'); await page.keyboard.type('updated');
  await expect.poll(() => page.evaluate(()=>(window as any).sharedFixture.edits.length)).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).sharedFixture.permission('view'));
  await expect(page.getByRole('button',{name:'Edit Markdown',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Attach PDF',exact:true})).toHaveCount(0);
});

test('rich peers have a named cursor and source formatting stays in source mode', async ({page}) => {
  await shared(page, 'Text');
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await expect(page.locator('.notes-peer-caret[title="Avery"]')).toBeVisible();
  await expect(page.locator('.notes-peer-caret')).toHaveAttribute('aria-label','Avery cursor');
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Shared note Markdown'});
  await source.fill('Words'); await source.selectText();
  await page.getByRole('button',{name:'Bold',exact:true}).click();
  await expect(source).toHaveValue('**Words**');
  await expect(source).toBeVisible();
});

test('the mobile toolbar moves formatting into its three-dot menu', async ({page}) => {
  await page.setViewportSize({width:320,height:720});
  await shared(page, 'Cells');
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(page.getByRole('button',{name:'More formatting options',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'More formatting options',exact:true}).click();
  await page.getByRole('button',{name:'Insert table',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Shared note Markdown'})).toHaveValue(/\| Column \| Column \|/);
  await expect(page.getByRole('textbox',{name:'Shared note Markdown'})).toBeVisible();
});

test('source keyboard history uses the shared undo owner exactly once',async({page})=>{
  await shared(page,'ABC');await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Shared note Markdown'});
  await source.fill('ABZC');await page.evaluate(()=>(window as any).sharedFixture.remote('XABZC'));
  await source.press('Control+z');await expect.poll(()=>page.evaluate(()=>(window as any).sharedFixture.undos)).toBe(1);
  await expect(source).toHaveValue('XABZC');
  await source.evaluate(field=>field.dispatchEvent(new InputEvent('beforeinput',{inputType:'historyRedo',bubbles:true,cancelable:true})));
  await expect.poll(()=>page.evaluate(()=>(window as any).sharedFixture.redos)).toBe(1);
});

test('source and rich presentation honor a remotely mapped caret',async({page})=>{
  await shared(page,'ABC');await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Shared note Markdown'});
  await source.evaluate((field:HTMLTextAreaElement)=>{field.focus();field.setSelectionRange(2,2);});
  await page.evaluate(()=>(window as any).sharedFixture.remote('XABC',{start:3,end:3}));
  await expect.poll(()=>source.evaluate((field:HTMLTextAreaElement)=>field.selectionStart)).toBe(3);
  await source.press('z');await expect(source).toHaveValue('XABzC');
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await page.locator('.notes-rich-editor').click();
  await page.evaluate(()=>(window as any).sharedFixture.remote('YXABzC',{start:4,end:4}));
  await page.keyboard.type('Q');
  await expect(page.locator('.notes-rich-editor')).toContainText('YXABQzC');
});
