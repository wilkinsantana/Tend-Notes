import { test, expect } from '@playwright/test';

test('an owner saves before creating a forwardable link, then can open and recover the shared session', async ({page}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath='/src/index.ts'; const {activate}=await import(modulePath);
    let noteDoc={id:'note-1',libraryId:'lib',name:'Plan.md',content:'Private draft',revision:'r',size:13,modifiedAt:1,canWrite:true};
    const otherNote={...noteDoc,id:'note-2',name:'Private.md',content:'Still private'};
    const fixture={saved:0,created:null as any,stopped:0,recovered:null as any};
    const sharing={version:1 as const,
      async list(){return {items:[],recoveryDocuments:[{documentId:'older-share',createdAt:1,status:'stopped'}]};},
      async create(_id:string,input:any){fixture.created=input;return {id:'link-1',secret:'secret token'};},
      async revoke(){}, async session(){return {session:'session token'};}, async stop(){fixture.stopped++;},
      async recovery(_id:string,documentId?:string){fixture.recovered=documentId;return {savedContent:'Saved copy',currentContent:'Current copy',candidateContent:'Candidate copy',status:'source_changed'};},
    };
    const host={id:'host.tend.notes',user:{id:'owner',name:'Owner',role:'user'},onUnmount(){},documents:{version:1,sharing,
      async libraries(){return [{id:'lib',name:'Notebook',canCreate:true}];},async index(){return {indexed:0,skipped:0,more:false};},
      async list(){return {items:[noteDoc,otherNote],total:2,nextOffset:null};},async read(id:string){return id===otherNote.id?otherNote:noteDoc;},
      async save(_id:string,input:any){fixture.saved++;noteDoc={...noteDoc,content:input.content,revision:'r'+fixture.saved};return noteDoc;},
      async create(){throw Error('unused');},async delete(){},
    }};
    (window as any).shareFixture=fixture; const root=document.createElement('div');root.style.height='720px';document.body.replaceChildren(root);activate(host as any).mount(root);
  });
  await page.getByRole('button',{name:/Plan.*Markdown/}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('textbox',{name:'Note Markdown'}).fill('Needs saving first');
  await page.getByRole('button',{name:'Share note',exact:true}).click();
  await page.getByRole('button',{name:'Create link',exact:true}).click();
  await expect.poll(() => page.evaluate(()=>(window as any).shareFixture.saved)).toBe(1);
  await expect(page.getByRole('textbox',{name:'Sharing link'})).toHaveValue(/#invite=secret%20token$/);
  await expect.poll(() => page.evaluate(()=>(window as any).shareFixture.created)).toEqual({permission:'view',passcode:null,ttlSeconds:86400,allowAttachments:false});
  await page.getByRole('button',{name:'Prepare shared editor',exact:true}).click();
  await expect(page.getByRole('link',{name:'Open shared editor',exact:true})).toHaveAttribute('href',/#session=session%20token$/);
  await page.getByRole('button',{name:'Pause sharing and prepare recovery copies',exact:true}).click();
  await expect(page.getByRole('button',{name:'Download saved copy',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Download canonical copy',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Download candidate copy',exact:true})).toBeVisible();
  await page.getByLabel('Recovery sharing session',{exact:true}).selectOption('older-share');
  await page.getByRole('button',{name:'Open saved recovery copies',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).shareFixture.recovered)).toBe('older-share');
  await page.getByRole('button',{name:'Close sharing',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toHaveAttribute('readonly','');
  await page.getByRole('button',{name:/Private.*Markdown/}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toBeEditable();
});
