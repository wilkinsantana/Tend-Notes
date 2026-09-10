import {test, expect, type Page} from '@playwright/test';

type FixtureOptions = {mobile: boolean; phoneVoices?: Array<{id:string;name:string;lang:string}>; mode?: 'device'|'download'; downloadedReady?: boolean; libraryReady?: boolean; rejectDevice?: boolean};

async function readingFixture(page: Page, options: FixtureOptions) {
  await page.addInitScript(config => {
    const state = {mode:config.mode ?? (config.mobile?'device':'download'), downloadedReady:config.downloadedReady??false, libraryReady:config.libraryReady??config.downloadedReady??false, deviceVoice:'', refreshes:0, libraryCalls:0, statusCalls:0, downloadedVoiceReads:0, generationReads:0, starts:[] as Array<{segments:string[];voice?:string}>, pauses:0, resumes:0, stops:0, aborts:0, nativeDisposed:0, modelInstalls:0, modelRemoves:0, voiceInstalls:0, voiceRemoves:0, syntheses:0};
    const phoneVoices=config.phoneVoices ?? [];
    const downloaded=[{id:'marius',name:'Marius',locale:'en-US',gender:'male',grade:'A',bytes:100,sha256:''},{id:'alba',name:'Alba',locale:'en-GB',gender:'female',grade:'A',bytes:100,sha256:''}];
    let active:{finish:()=>void;options:any;stopped:boolean}|null=null;
    const native={isMobile:config.mobile,
      async refreshVoices(){state.refreshes++;return phoneVoices;},listVoices(){return phoneVoices;},
      start(read:any){state.starts.push({segments:[...read.segments],voice:read.voice});let finish!:()=>void;const done=new Promise<void>(resolve=>finish=resolve);const session={finish,options:read,stopped:false};active=session;
        const stop=()=>{if(session.stopped)return;session.stopped=true;state.stops++;read.onSegment?.(null);read.onState?.('stopped');finish();};
        read.signal?.addEventListener('abort',()=>{state.aborts++;stop();},{once:true});read.onSegment?.(0);read.onState?.('playing');
        return {done,async pause(){state.pauses++;read.onSegment?.(null);read.onState?.('paused');},async resume(){state.resumes++;read.onState?.('playing');read.onSegment?.(0);},stop};
      },dispose(){state.nativeDisposed++;},
    };
    const tts:any={supportsSegments:true,native,
      getReadingMode(){return state.mode;},setReadingMode(mode:'device'|'download'){if(config.rejectDevice&&mode==='device')throw Error('Device voices need a newer host.');state.mode=mode;},getDeviceVoice(){return state.deviceVoice;},setDeviceVoice(id:string){state.deviceVoice=id;},
      async getInstallState(){state.statusCalls++;return {model:state.downloadedReady?'ready':'not-installed',modelBytes:{installed:state.downloadedReady?100:0,total:100},installedVoices:state.downloadedReady?['marius']:[],defaultVoice:'marius'};},
      async getVoiceLibraryState(){state.libraryCalls++;return {ready:state.libraryReady,bytes:200,voices:downloaded};},
      listVoices(){state.downloadedVoiceReads++;return state.libraryReady?downloaded:[downloaded[0]];},getGenerationSettings(){state.generationReads++;return {temperature:.7};},async installModel(){state.modelInstalls++;state.downloadedReady=true;state.libraryReady=true;},async removeModel(){state.modelRemoves++;},async installVoice(){state.voiceInstalls++;},async removeVoice(){state.voiceRemoves++;},getDefaultVoice(){return 'marius';},setDefaultVoice(){},
      async previewVoice(){return {sampleRate:24000 as const,chunks:0,sampleCount:0};},async synthesize(){state.syntheses++;return {sampleRate:24000 as const,chunks:0,sampleCount:0};},cancel(){},dispose(){},
    };
    Object.assign(window,{nativeReadingState:state,nativeReadingControl:{finish(){active?.finish();}},notesSpeechFixture:{version:1,tts,
      async status(){return {installed:false,bytes:0};},async install(){},async remove(){},async start(){return {async stop(){},cancel(){}};},dispose(){},
    }});
  }, options);
}

async function openSettings(page: Page) {
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  return page.getByRole('dialog',{name:'Device speech settings'});
}

test('mobile uses existing phone voices without a download and previews a fixed sample',async({page})=>{
  await page.setViewportSize({width:390,height:844});await readingFixture(page,{mobile:true,phoneVoices:[{id:'phone-a',name:'Phone voice A',lang:'en-US'},{id:'phone-b',name:'Phone voice B',lang:'en-GB'}]});await page.goto('/');
  const settings=await openSettings(page);
  await expect(settings.getByRole('group',{name:'Reading voices'})).toBeVisible();
  await expect(settings.getByRole('button',{name:'Phone voices'})).toHaveAttribute('aria-pressed','true');
  await expect(settings.getByLabel('Phone voice')).toHaveValue('phone-a');
  expect(await page.evaluate(()=>(window as any).nativeReadingState)).toMatchObject({statusCalls:0,downloadedVoiceReads:0,generationReads:0,modelInstalls:0,voiceInstalls:0,deviceVoice:'phone-a'});
  await settings.getByRole('combobox',{name:'Language',exact:true}).selectOption('en-GB');
  await settings.getByLabel('Phone voice').selectOption('phone-b');
  await settings.getByRole('button',{name:'Preview',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).nativeReadingState.starts[0])).toEqual({segments:['This is how your notes will sound with this voice.'],voice:'phone-b'});
  await settings.getByRole('button',{name:'Close speech settings'}).click();
  expect(await page.evaluate(()=>(window as any).nativeReadingState)).toMatchObject({stops:1,aborts:1,modelInstalls:0,voiceInstalls:0});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('mobile switches to downloaded voices explicitly and never starts a download on selection',async({page})=>{
  await page.setViewportSize({width:390,height:844});await readingFixture(page,{mobile:true,phoneVoices:[{id:'phone-a',name:'Phone voice A',lang:'en-US'}]});await page.goto('/');
  const settings=await openSettings(page);await settings.getByRole('button',{name:'Downloaded voices'}).click();
  await expect(settings.getByRole('button',{name:'Downloaded voices'})).toHaveAttribute('aria-pressed','true');
  await expect(settings.getByRole('button',{name:/Set up reading/})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).nativeReadingState)).toMatchObject({mode:'download',statusCalls:1,modelInstalls:0,voiceInstalls:0});
  await settings.getByRole('button',{name:/Set up reading/}).click();
  expect(await page.evaluate(()=>(window as any).nativeReadingState.modelInstalls)).toBe(1);
});

test('native reading owns pause resume stop and paragraph follow callbacks',async({page})=>{
  await page.setViewportSize({width:390,height:844});await readingFixture(page,{mobile:true,phoneVoices:[{id:'phone-a',name:'Phone voice A',lang:'en-US'}]});await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  const read=page.getByRole('button',{name:'Read selection or note aloud',exact:true});await expect(read).toHaveAttribute('title','Read selection or note aloud');await read.click();
  const preview=page.locator('.preview');await expect(preview.locator('[data-notes-reading]')).toHaveCount(1);
  await page.getByRole('button',{name:'Pause read aloud'}).click();await expect(preview.locator('[data-notes-reading]')).toHaveCount(0);
  await page.getByRole('button',{name:'Resume read aloud'}).click();await expect(preview.locator('[data-notes-reading]')).toHaveCount(1);
  await page.getByRole('button',{name:'Stop read aloud'}).click();await expect(preview.locator('[data-notes-reading]')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).nativeReadingState)).toMatchObject({pauses:1,resumes:1,stops:1,aborts:1,syntheses:0,modelInstalls:0});
  await read.click();await expect(preview.locator('[data-notes-reading]')).toHaveCount(1);
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();const editor=page.getByRole('textbox',{name:'Note Markdown'});await editor.fill((await editor.inputValue())+'\nChanged while reading.');
  await expect.poll(()=>page.evaluate(()=>(window as any).nativeReadingState.stops)).toBe(2);
  await expect(page.locator('[data-notes-reading]')).toHaveCount(0);
});

test('desktop switches between device and downloaded voices without changing downloads or selections',async({page})=>{
  await readingFixture(page,{mobile:false,phoneVoices:[{id:'system',name:'System voice',lang:'en-US'}],mode:'download',downloadedReady:true});await page.goto('/');
  const settings=await openSettings(page);
  await expect(settings.getByRole('button',{name:'Device voices'})).toHaveAttribute('aria-pressed','false');await expect(settings.getByRole('button',{name:'Downloaded voices'})).toHaveAttribute('aria-pressed','true');
  await expect(settings.getByText('Switching changes which voices Notes uses. Existing downloads stay on this device.')).toBeVisible();await settings.getByRole('combobox',{name:'Choose a voice',exact:true}).selectOption('alba');
  await settings.getByRole('button',{name:'Device voices'}).click();await expect(settings.getByLabel('Device voice')).toHaveValue('system');await settings.getByRole('button',{name:'Preview',exact:true}).click();await settings.getByRole('button',{name:'Downloaded voices'}).click();
  await expect(settings.getByRole('combobox',{name:'Choose a voice',exact:true})).toHaveValue('alba');
  await expect(settings.getByLabel('Engine',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).nativeReadingState)).toMatchObject({mode:'download',stops:1,aborts:1,modelInstalls:0,modelRemoves:0,voiceInstalls:0,voiceRemoves:0});
  await settings.getByRole('button',{name:'Device voices'}).click();await settings.getByRole('button',{name:'Close speech settings'}).click();await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();await page.getByRole('button',{name:'Read selection or note aloud',exact:true}).click();await expect(page.locator('[data-notes-reading]')).toHaveCount(1);expect(await page.evaluate(()=>(window as any).nativeReadingState.starts.length)).toBe(2);await page.getByRole('button',{name:'Stop read aloud'}).click();
});

test('a host rejection keeps downloaded mode selected and explains the failure',async({page})=>{
  await readingFixture(page,{mobile:false,phoneVoices:[{id:'system',name:'System voice',lang:'en-US'}],mode:'download',downloadedReady:true,rejectDevice:true});await page.goto('/');const settings=await openSettings(page);await settings.getByRole('button',{name:'Device voices'}).click();
  await expect(settings.getByRole('alert')).toHaveText('Device voices need a newer host.');await expect(settings.getByRole('button',{name:'Downloaded voices'})).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>(window as any).nativeReadingState.mode)).toBe('download');
});

test('mobile with no phone voices gives visible retry feedback and aligned fallback controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await readingFixture(page,{mobile:true,phoneVoices:[]});await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();await page.getByRole('button',{name:'Read selection or note aloud',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Device speech settings'});
  await expect(settings.getByText('No phone voices are available to Notes on this device.')).toBeVisible();
  const retry=settings.getByRole('button',{name:'Retry phone voices'}),fallback=settings.getByRole('button',{name:'Use downloaded reading'});
  await expect(fallback).toBeVisible();await retry.click();await expect(settings.getByText('Checked just now. This browser did not return any local phone voices.')).toBeVisible();
  const boxes=await Promise.all([retry.boundingBox(),fallback.boundingBox()]);expect(boxes[0]?.height).toBe(44);expect(boxes[1]?.height).toBe(44);expect(Math.abs((boxes[0]?.y??0)+(boxes[0]?.height??0)-(boxes[1]?.y??0)-(boxes[1]?.height??0))).toBeLessThan(1);
  expect(await page.evaluate(()=>(window as any).nativeReadingState)).toMatchObject({statusCalls:0,downloadedVoiceReads:0,generationReads:0,modelInstalls:0,voiceInstalls:0,starts:[]});
});

test('desktop empty device mode aligns retry and downloaded reading actions',async({page})=>{
  await page.setViewportSize({width:1024,height:800});await readingFixture(page,{mobile:false,phoneVoices:[],mode:'device',downloadedReady:true});await page.goto('/');const settings=await openSettings(page);
  const retry=settings.getByRole('button',{name:'Retry device voices'}),fallback=settings.getByRole('button',{name:'Use downloaded reading'});await expect(retry).toBeVisible();
  const boxes=await Promise.all([retry.boundingBox(),fallback.boundingBox()]);expect(boxes[0]?.height).toBe(44);expect(boxes[1]?.height).toBe(44);expect(Math.abs((boxes[0]?.y??0)+(boxes[0]?.height??0)-(boxes[1]?.y??0)-(boxes[1]?.height??0))).toBeLessThan(1);
  expect(await page.evaluate(()=>(window as any).nativeReadingState)).toMatchObject({modelInstalls:0,voiceInstalls:0});
});

test('downloaded voice library is discoverable, explicit, and keeps technical labels out of choices',async({page})=>{
  await readingFixture(page,{mobile:false,phoneVoices:[],mode:'download',downloadedReady:true,libraryReady:false});await page.goto('/');const settings=await openSettings(page);
  const selectedMode=settings.getByRole('button',{name:'Downloaded voices'});await expect(selectedMode).toHaveAttribute('aria-pressed','true');
  await settings.getByRole('button',{name:'Browse voices'}).click();const library=settings.getByRole('region',{name:'Voice library'});await expect(library).toBeVisible();
  await expect(library.getByRole('button',{name:/Marius.*Downloaded/})).toBeEnabled();await expect(library.getByRole('button',{name:/Alba.*Available/})).toBeDisabled();
  const chooser=settings.getByRole('combobox',{name:'Choose a voice',exact:true});await expect(chooser.locator('option')).toHaveText(['Marius · en-US · Downloaded']);
  expect(await page.evaluate(()=>(window as any).nativeReadingState)).toMatchObject({modelInstalls:0,voiceInstalls:0,libraryCalls:1});
  const setup=library.getByRole('button',{name:/Prepare voice library/});
  const colors=[await setup.evaluate(node=>getComputedStyle(node).backgroundColor),await selectedMode.evaluate(node=>getComputedStyle(node).backgroundColor)];expect(colors[0]).not.toBe(colors[1]);
  await setup.click();await expect(chooser.locator('option')).toHaveText(['Marius · en-US · Downloaded','Alba · en-GB · Available']);
  await library.getByRole('button',{name:/Alba.*Available/}).click();await expect(chooser).toHaveValue('alba');await expect(settings.getByRole('button',{name:'Download voice',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).nativeReadingState)).toMatchObject({modelInstalls:1,voiceInstalls:0});
  const before=await page.evaluate(()=>(window as any).nativeReadingState.libraryCalls);await library.getByRole('button',{name:'Refresh list'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).nativeReadingState.libraryCalls)).toBeGreaterThan(before);await page.screenshot({path:'test-results/speech-settings-voice-library.png'});
});
