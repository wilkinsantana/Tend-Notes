import {test, expect, type Page} from '@playwright/test';

async function fixture(page: Page) {
  await page.addInitScript(() => {
    const state = {installed:false, starts:0, cancelled:0, removed:0, voice:'af_heart', voices:[] as string[], model:false, callbacks:null as any};
    const tts = {
      async getInstallState(){return {model:state.model?'ready':'not-installed',modelBytes:{installed:state.model?100:0,total:100},installedVoices:[...state.voices],defaultVoice:state.voice};},
      listVoices(){return [{id:'af_heart',name:'Heart',locale:'en-US',gender:'female',grade:'A',bytes:100,sha256:''},{id:'af_bella',name:'Bella',locale:'en-US',gender:'female',grade:'A',bytes:100,sha256:''}];},
      async installModel(){state.model=true;},async removeModel(){state.model=false;},
      async installVoice(id:string){state.voices.push(id);},async removeVoice(id:string){state.voices=state.voices.filter(v=>v!==id);},
      getDefaultVoice(){return state.voice;},setDefaultVoice(id:string){state.voice=id;},
      async previewVoice(_id:string,options:any){await options.onChunk({pcm:new Float32Array(2400).buffer,sampleRate:24000});},
      async synthesize(options:any){await options.onChunk({pcm:new Float32Array(2400).buffer,sampleRate:24000});},cancel(){},dispose(){},
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
