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

test('downloaded voice settings install voices separately and select a default',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await fixture(page);
  await page.goto('/');
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Device speech settings'});
  await settings.getByRole('button',{name:/Set up reading/}).click();
  await expect(settings.getByRole('button',{name:'Download voice',exact:true})).toBeVisible();
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
  await expect(setup.getByRole('button',{name:/Set up reading/})).toBeVisible();
  await expect(setup.getByRole('button',{name:'Download local dictation'})).toHaveCount(0);
  await setup.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('button',{name:'More formatting options',exact:true}).click();
  await expect(dictate).toBeVisible();
  await dictate.click();
  await expect(setup.getByRole('button',{name:'Download local dictation'})).toBeVisible();
  await expect(setup.getByRole('button',{name:/Set up reading/})).toHaveCount(0);
  await setup.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await page.getByRole('button',{name:'More formatting options',exact:true}).click();
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
  await setup.getByRole('button',{name:/Set up reading/}).click();
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
  await setup.getByRole('button',{name:/Set up reading/}).click();
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

test('formatting toolbar groups audio separately, keeps reading in preview, and preserves labeled groups in mobile overflow',async({page})=>{
  await fixture(page);await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const audio=page.getByRole('group',{name:'Audio',exact:true});
  for(const name of ['Dictate text','Read selection or note aloud','Insert audio','Device speech settings']) await expect(audio.getByRole('button',{name,exact:true})).toBeVisible();
  await expect(page.locator('header').getByRole('group',{name:'Audio',exact:true})).toHaveCount(0);
  await expect(page.getByRole('group',{name:'Text',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  const previewAudio=page.getByRole('group',{name:'Audio',exact:true});
  await expect(previewAudio.getByRole('button',{name:'Read selection or note aloud',exact:true})).toBeVisible();
  await expect(previewAudio.getByRole('button',{name:'Dictate text',exact:true})).toHaveCount(0);
  await expect(previewAudio.getByRole('button',{name:'Insert audio',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  if(process.env.NOTES_TOOLBAR_SCREENSHOT) await page.screenshot({path:process.env.NOTES_TOOLBAR_SCREENSHOT});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'More formatting options',exact:true}).click();
  await expect(page.getByRole('group',{name:'Insert and attach',exact:true})).toBeVisible();
  await expect(page.getByRole('group',{name:'Tables and formulas',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('long reading prepares following chunks during audio playback and drains the tail',async({page})=>{
  await fixture(page);await page.goto('/');
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const setup=page.getByRole('dialog',{name:'Device speech settings'});
  await setup.getByRole('button',{name:/Set up reading/}).click();
  await setup.getByRole('button',{name:'Download voice',exact:true}).click();
  await setup.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.evaluate(()=>{
    const w=window as any, Original=window.AudioContext;
    w.audioEvidence={ended:0,secondQueuedBeforeEnd:false};
    w.AudioContext=class extends Original{
      createBufferSource(){const node=super.createBufferSource();node.addEventListener('ended',()=>w.audioEvidence.ended++);return node;}
    };
    w.notesSpeechFixture.tts.synthesize=async(o:any)=>{
      for(let i=0;i<3;i++){
        await new Promise(resolve=>setTimeout(resolve,80));
        await o.onChunk({segmentIndex:0,index:i,pcm:new Float32Array(24000).buffer,sampleRate:24000,sampleCount:24000});
        if(i===1)w.audioEvidence.secondQueuedBeforeEnd=w.audioEvidence.ended===0;
      }
      return {sampleRate:24000,chunks:3,sampleCount:72000};
    };
  });
  const read=page.getByRole('button',{name:'Read selection or note aloud',exact:true});
  await read.click();await expect(read).toBeEnabled({timeout:10000});
  expect(await page.evaluate(()=>(window as any).audioEvidence)).toEqual({ended:3,secondQueuedBeforeEnd:true});
});

test('mobile paragraph highlight follows audible buffers, respects pause and disengages after manual scrolling',async({page})=>{
  await page.setViewportSize({width:390,height:844});await fixture(page);
  await page.addInitScript(() => {
    const paragraphs=Array.from({length:12},(_,index)=>`Paragraph ${index+1} ${'gentle scrolling words '.repeat(24)}`.trim());
    localStorage.setItem('tend-notes:demo-documents',JSON.stringify([{id:'reading',libraryId:'personal',name:'Long reading.md',content:paragraphs.join('\n\n'),revision:'r',modifiedAt:1,size:paragraphs.join('\n\n').length}]));
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const setup=page.getByRole('dialog',{name:'Device speech settings'});
  await setup.getByRole('button',{name:/Set up reading/}).click();
  await setup.getByRole('button',{name:'Download voice',exact:true}).click();
  await setup.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:/Long reading.*Markdown/}).click();
  await page.evaluate(() => {
    const scope=window as any;
    class FakeNode {
      buffer:any=null;onended:(()=>void)|null=null;at=0;stopped=false;ended=false;
      connect(){} disconnect(){} start(at:number){this.at=at;} stop(){this.stopped=true;}
    }
    class FakeAudioContext {
      currentTime=0;state='running';destination={};onstatechange:(()=>void)|null=null;nodes:FakeNode[]=[];
      constructor(){scope.readingAudio=this;}
      async resume(){this.state='running';this.onstatechange?.();}
      async suspend(){this.state='suspended';this.onstatechange?.();}
      async close(){this.state='closed';}
      createBuffer(){return {copyToChannel(){}};}
      createBufferSource(){const node=new FakeNode();this.nodes.push(node);return node;}
    }
    scope.AudioContext=FakeAudioContext;
    scope.notesSpeechFixture.tts.synthesize=async(o:any)=>{
      for(let index=0;index<o.segments.length;index++) await o.onChunk({segmentIndex:index,index,pcm:new Float32Array(24000).buffer,sampleRate:24000,sampleCount:24000});
      return {sampleRate:24000,chunks:o.segments.length,sampleCount:o.segments.length*24000};
    };
  });
  const read=page.getByRole('button',{name:'Read selection or note aloud',exact:true});await read.click();
  const preview=page.locator('.preview');const paragraphs=preview.locator('p');
  await expect(paragraphs.nth(0)).toHaveAttribute('data-notes-reading','true');
  await expect(paragraphs.nth(1)).not.toHaveAttribute('data-notes-reading','true');
  await page.getByRole('button',{name:'Pause read aloud'}).click();
  await expect(preview.locator('[data-notes-reading]')).toHaveCount(0);
  await page.getByRole('button',{name:'Resume read aloud'}).click();
  await expect(paragraphs.nth(0)).toHaveAttribute('data-notes-reading','true');
  const follow=page.getByRole('checkbox',{name:'Follow reading'});await follow.uncheck();
  for(let index=0;index<8;index++) {
    await expect.poll(()=>page.evaluate(()=>(window as any).readingAudio.nodes.length)).toBeGreaterThan(index);
    await page.evaluate(index=>{const audio=(window as any).readingAudio;audio.currentTime=index+1;audio.nodes[index].ended=true;audio.nodes[index].onended?.();},index);
  }
  await expect(paragraphs.nth(8)).toHaveAttribute('data-notes-reading','true');
  expect(await preview.evaluate(node=>node.scrollTop)).toBe(0);
  await follow.check();await expect.poll(()=>preview.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
  await preview.locator('.rendered-markdown').dispatchEvent('wheel',{deltaY:-100});await expect(follow).not.toBeChecked();
  await follow.check();await preview.focus();await page.keyboard.press('PageDown');await expect(follow).not.toBeChecked();
  // PageDown starts the browser's own animated scroll. Wait for it to settle
  // before testing whether the next spoken paragraph moves the viewport.
  await preview.evaluate(node=>new Promise<void>(resolve=>{
    let timer:ReturnType<typeof setTimeout>;
    const done=()=>{node.removeEventListener('scroll',settle);resolve();};
    const settle=()=>{clearTimeout(timer);timer=setTimeout(done,200);};
    node.addEventListener('scroll',settle);settle();
  }));
  await preview.evaluate(node=>node.scrollTo({top:0,behavior:'instant'}));
  await page.evaluate(()=>{const audio=(window as any).readingAudio;audio.currentTime=9;audio.nodes[8].ended=true;audio.nodes[8].onended?.();});
  await expect(paragraphs.nth(9)).toHaveAttribute('data-notes-reading','true');expect(await preview.evaluate(node=>node.scrollTop)).toBe(0);
  await page.getByRole('button',{name:'Stop read aloud'}).click();
  await expect(preview.locator('[data-notes-reading]')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).readingAudio.nodes.every((node:any)=>node.stopped||node.ended))).toBe(true);
  await paragraphs.nth(1).evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);});
  await read.click();await expect(page.getByRole('button',{name:'Stop read aloud'})).toBeVisible();
  await expect(preview.locator('[data-notes-reading]')).toHaveCount(0);
  await page.getByRole('button',{name:'Stop read aloud'}).click();
});

test('speech DOM mapping skips unmatched content without losing later paragraphs',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const result=await page.evaluate(async()=>{
    const path='/src/speechFollow.ts';const {mapSpeechParagraphs,showSpeechParagraph}=await import(/* @vite-ignore */path);
    const root=document.createElement('div');root.style.cssText='position:fixed;inset:0 auto auto 0;width:300px;height:100px;overflow:auto';
    for(const text of ['First paragraph','Later paragraph']){const p=document.createElement('p');p.textContent=text;p.style.height='90px';root.append(p);}document.body.append(root);
    const mapped=mapSpeechParagraphs(root,['Missing image description','Later paragraph']);
    const before=root.scrollTop;showSpeechParagraph(root,['Missing image description','Later paragraph'],1,true);
    await new Promise(resolve=>setTimeout(resolve,250));
    return {mapped:mapped.get(1)?.textContent,before,after:root.scrollTop,active:root.querySelector('[data-notes-reading]')?.textContent};
  });
  expect(result).toMatchObject({mapped:'Later paragraph',before:0,active:'Later paragraph'});expect(result.after).toBeGreaterThan(0);
});
