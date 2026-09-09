import {test, expect, type Page} from '@playwright/test';

async function fixture(page: Page) {
  await page.addInitScript(() => {
    const state = {installed:false, syntheses:0, spoken:[] as string[], batches:[] as string[][], starts:0, cancelled:0, removed:0, voice:'af_heart', voices:[] as string[], model:false, callbacks:null as any};
    const tts = {supportsSegments:true,
      async getInstallState(){return {model:state.model?'ready':'not-installed',modelBytes:{installed:state.model?100:0,total:100},installedVoices:[...state.voices],defaultVoice:state.voice};},
      listVoices(){return [{id:'af_heart',name:'Heart',locale:'en-US',gender:'female',grade:'A',bytes:100,sha256:''},{id:'af_bella',name:'Bella',locale:'en-US',gender:'female',grade:'A',bytes:100,sha256:''}];},
      async installModel(){state.model=true;},async removeModel(){state.model=false;},
      async installVoice(id:string){state.voices.push(id);},async removeVoice(id:string){state.voices=state.voices.filter(v=>v!==id);},
      getDefaultVoice(){return state.voice;},setDefaultVoice(id:string){state.voice=id;},
      async previewVoice(_id:string,options:any){await options.onChunk({pcm:new Float32Array(2400).buffer,sampleRate:24000});},
      async synthesize(options:any){state.syntheses++;state.spoken.push(options.text);const segments=options.segments??[options.text];state.batches.push(segments);for(let i=0;i<segments.length;i++)await options.onChunk({segmentIndex:i,index:i,pcm:new Float32Array(2400).buffer,sampleRate:24000,sampleCount:2400});return {sampleRate:24000,chunks:segments.length,sampleCount:segments.length*2400};},cancel(){},dispose(){},
    };
    Object.assign(window,{speechFixtureState:state,notesSpeechFixture:{version:1,tts,
      async status(){return {installed:state.installed,bytes:58_000_000};},
      async install(progress:any){state.installed=true;progress(58_000_000,58_000_000);},
      async remove(){state.installed=false;state.removed++;},
      async start(callbacks:any){state.starts++;state.callbacks=callbacks;return {async stop(){callbacks.onFinal('A captured thought');},cancel(){state.cancelled++;}};},dispose(){},
    }});
  });
}

test('speech stays absent when the host does not provide it',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Device speech settings',exact:true})).toHaveCount(0);
});

test('opt-in dictation reviews text before insertion and inserts as one undo step',async({page})=>{
  await fixture(page);
  await page.goto('/');
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Device speech settings'});
  await expect(settings).toBeVisible();
  expect(await page.evaluate(()=>(window as any).speechFixtureState.starts)).toBe(0);
  await settings.getByRole('button',{name:'Download local dictation'}).click();
  await expect(settings.getByText('Ready',{exact:true})).toBeVisible();
  await settings.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Note Markdown'});
  const before=await editor.inputValue();
  await editor.focus();
  await page.keyboard.press('Control+End');
  const dictate=page.getByRole('button',{name:'Dictate text',exact:true});
  if(!await dictate.isVisible()) await page.getByRole('button',{name:'More formatting options'}).click();
  await dictate.click();
  const dialog=page.getByRole('dialog',{name:'Dictate text'});
  await dialog.getByRole('button',{name:'Start dictation',exact:true}).click();
  await page.evaluate(()=>(window as any).speechFixtureState.callbacks.onPartial('A captured'));
  await expect(editor).toHaveValue(before);
  await dialog.getByRole('button',{name:'Stop and finish'}).click();
  await expect(dialog.getByText('A captured thought',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:/Insert.*transcript|Insert into note/}).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveValue(before+'A captured thought');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(editor).toHaveValue(before);
});

test('mobile voice settings download voices separately and select a default',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await fixture(page);
  await page.goto('/');
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Device speech settings'});
  await settings.getByRole('button',{name:/Download read-aloud model/}).click();
  await expect(settings.getByText('Model ready')).toBeVisible();
  await settings.getByRole('button',{name:'Download voice',exact:true}).click();
  await expect(settings.getByRole('button',{name:'Preview',exact:true})).toBeVisible();
  await settings.getByLabel('Voice',{exact:true}).selectOption('af_bella');
  await settings.getByRole('button',{name:'Download voice',exact:true}).click();
  await settings.getByRole('button',{name:'Use by default',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).speechFixtureState.voice)).toBe('af_bella');
  await page.evaluate(() => { Object.defineProperty(window,'AudioContext',{configurable:true,value:class { constructor(){throw Error('Audio device unavailable');} }}); });
  await settings.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(settings.getByRole('alert')).toHaveText('Audio device unavailable');
  await settings.getByRole('button',{name:'Remove voice',exact:true}).click();
  await expect(settings.getByRole('button',{name:'Download voice',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('speech icons are visible before downloads and offer only the selected feature',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await fixture(page);
  await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  const read=page.getByRole('button',{name:'Read selection or note aloud',exact:true});
  const dictate=page.getByRole('button',{name:'Dictate text',exact:true});
  await expect(read).toBeVisible();
  await expect(dictate).toHaveCount(0);
  await read.click();
  const setup=page.getByRole('dialog',{name:'Device speech settings'});
  await expect(setup.getByRole('button',{name:/Download read-aloud model/})).toBeVisible();
  await expect(setup.getByRole('button',{name:'Download local dictation'})).toHaveCount(0);
  await setup.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await expect(dictate).toBeVisible();
  await dictate.click();
  await expect(setup.getByRole('button',{name:'Download local dictation'})).toBeVisible();
  await expect(setup.getByRole('button',{name:/Download read-aloud model/})).toHaveCount(0);
  await setup.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await expect(dictate).toBeVisible();
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(dictate).toHaveCount(0);
  await expect(read).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('unchanged note replays and only edited paragraphs are synthesized',async({page})=>{
  await fixture(page);await page.goto('/');
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const setup=page.getByRole('dialog',{name:'Device speech settings'});
  await setup.getByRole('button',{name:/Download read-aloud model/}).click();
  await setup.getByRole('button',{name:'Download voice',exact:true}).click();
  await setup.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('textbox',{name:'Note Markdown'}).fill('Alpha paragraph.\n\nBeta paragraph.\n\nCharlie paragraph.');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  const read=page.getByRole('button',{name:'Read selection or note aloud',exact:true});
  await read.click();await expect(read).toBeEnabled();
  await read.click();await expect(read).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).speechFixtureState.syntheses)).toBe(1);
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('textbox',{name:'Note Markdown'}).fill('Alpha paragraph.\n\nDelta paragraph.\n\nCharlie paragraph.');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await read.click();await expect(read).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).speechFixtureState.syntheses)).toBe(2);
  expect(await page.evaluate(()=>(window as any).speechFixtureState.batches)).toEqual([['Alpha paragraph.','Beta paragraph.','Charlie paragraph.'],['Delta paragraph.']]);
});


test('highlighting a preview paragraph reads only that text',async({page})=>{
  await fixture(page);await page.goto('/');
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const setup=page.getByRole('dialog',{name:'Device speech settings'});
  await setup.getByRole('button',{name:/Download read-aloud model/}).click();
  await setup.getByRole('button',{name:'Download voice',exact:true}).click();
  await setup.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  const paragraph=page.locator('.preview p').first();
  const expected=await paragraph.innerText();
  await paragraph.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);});
  const read=page.getByRole('button',{name:'Read selection or note aloud',exact:true});
  await read.click();await expect(read).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).speechFixtureState.spoken)).toEqual([expected.trim()]);
});

test('toolbar groups audio separately and preserves labeled groups in mobile overflow',async({page})=>{
  await fixture(page);await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const audio=page.getByRole('group',{name:'Audio',exact:true});
  for(const name of ['Dictate text','Read selection or note aloud','Insert audio','Device speech settings']) await expect(audio.getByRole('button',{name,exact:true})).toBeVisible();
  await expect(page.getByRole('group',{name:'Text',exact:true})).toBeVisible();
  if(process.env.NOTES_TOOLBAR_SCREENSHOT) await page.screenshot({path:process.env.NOTES_TOOLBAR_SCREENSHOT});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'More formatting options',exact:true}).click();
  await expect(page.getByRole('group',{name:'Insert and attach',exact:true})).toBeVisible();
  await expect(page.getByRole('group',{name:'Tables and formulas',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
