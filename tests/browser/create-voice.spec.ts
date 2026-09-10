import {test,expect,type Page} from '@playwright/test';

function wav(seconds=.75,sampleRate=16000){
  const count=Math.floor(seconds*sampleRate),buffer=Buffer.alloc(44+count*2);buffer.write('RIFF',0);buffer.writeUInt32LE(36+count*2,4);buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(sampleRate,24);buffer.writeUInt32LE(sampleRate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);return buffer;
}

async function fixture(page:Page,options:{setupReady?:boolean;delayedCreate?:boolean;delayedPermission?:boolean;recordingMock?:boolean;delayedClose?:boolean}={}){
  await page.addInitScript(config=>{
    const state={setupReady:config.setupReady??true,prepareCalls:0,createCalls:0,createAborts:0,removeCalls:0,listCalls:0,previewIds:[] as string[],defaultVoice:'marius',saved:[] as Array<{id:string;label:string;language:string;createdAt:number}>,wavBytes:0,wavHeader:'',samplePreviews:0,samplePauses:0,trackStops:0,contextCloses:0,objectUrls:0};
    const originalCreateUrl=URL.createObjectURL.bind(URL);URL.createObjectURL=(value:any)=>{state.objectUrls++;return originalCreateUrl(value);};
    let releasePermission:(()=>void)|null=null;
    const stream={getTracks:()=>[{stop(){state.trackStops++;}}]};
    const privateVoices={
      async list(){state.listCalls++;return [...state.saved];},
      async getSetupState(){return {model:state.setupReady?'ready':'not-installed',modelBytes:{installed:state.setupReady?100:0,total:100},installedVoices:[],defaultVoice:'marius'};},
      async prepare(options?:any){state.prepareCalls++;options?.onProgress?.({phase:'downloading',item:'runtime',completedBytes:50,totalBytes:100});state.setupReady=true;},
      async create(input:any){state.createCalls++;state.wavBytes=input.wav.byteLength;state.wavHeader=new TextDecoder().decode(input.wav.slice(0,4));if(config.delayedCreate)await new Promise<void>((resolve,reject)=>{if(input.signal?.aborted){reject(new DOMException('cancelled','AbortError'));return;}input.signal?.addEventListener('abort',()=>{state.createAborts++;reject(new DOMException('cancelled','AbortError'));},{once:true});});const voice={id:`personal-${state.createCalls}`,label:input.label,language:'English',createdAt:Date.UTC(2026,8,10)};state.saved.push(voice);return voice;},
      async remove(id:string){state.removeCalls++;state.saved=state.saved.filter(voice=>voice.id!==id);},
    };
    const base={id:'marius',name:'Marius',locale:'en-US',gender:'male',grade:'A',bytes:100,sha256:''};
    const tts={supportsSegments:true,privateVoices,getReadingMode(){return 'download' as const;},
      async getInstallState(){return {model:'ready' as const,modelBytes:{installed:100,total:100},installedVoices:['marius',...state.saved.map(voice=>voice.id)],defaultVoice:state.defaultVoice};},
      listVoices(){return [base,...state.saved.map(voice=>({id:voice.id,name:voice.label,locale:'en-US' as const,gender:'female' as const,grade:'Personal voice · this device',bytes:0,sha256:voice.id,personal:true}))];},
      async installModel(){},async removeModel(){},async installVoice(){},async removeVoice(){},getDefaultVoice(){return state.defaultVoice;},setDefaultVoice(id:string){state.defaultVoice=id;},
      async previewVoice(id:string){state.previewIds.push(id);return {sampleRate:24000 as const,chunks:0,sampleCount:0};},async synthesize(){return {sampleRate:24000 as const,chunks:0,sampleCount:0};},cancel(){},dispose(){},
    };
    class SampleAudio{onended:(()=>void)|null=null;constructor(_url:string){}async play(){state.samplePreviews++;queueMicrotask(()=>this.onended?.());}pause(){state.samplePauses++;}}
    Object.defineProperty(window,'Audio',{configurable:true,value:SampleAudio});
    if(config.recordingMock){
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>stream}});
      class Context{sampleRate=16000;state='running';destination={};onstatechange:null=null;currentTime=0;async resume(){}async suspend(){}async close(){state.contextCloses++;if(config.delayedClose)await new Promise<void>(resolve=>(window as any).releaseVoiceContextClose=resolve);this.state='closed';}createMediaStreamSource(){return{connect(){},disconnect(){}};}createScriptProcessor(){const processor={onaudioprocess:null as any,connect(){},disconnect(){}};(window as any).voiceProcessor=processor;return processor;}createGain(){return{gain:{value:1},connect(){},disconnect(){}};}createBuffer(){return{copyToChannel(){}};}createBufferSource(){return{connect(){},disconnect(){},start(){},stop(){},onended:null};}}
      Object.defineProperty(window,'AudioContext',{configurable:true,value:Context});
    }else if(config.delayedPermission){Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{await new Promise<void>(resolve=>releasePermission=resolve);return stream;}}});}
    Object.assign(window,{createVoiceState:state,createVoiceControl:{releasePermission(){releasePermission?.();}},notesSpeechFixture:{version:1,tts,async status(){return {installed:false,bytes:0};},async install(){},async remove(){},async start(){return {async stop(){},cancel(){}};},dispose(){}}});
  },options);
}

async function openCreate(page:Page){await page.goto('/');await page.getByRole('button',{name:'Device speech settings',exact:true}).click();const settings=page.getByRole('dialog',{name:'Device speech settings'});await settings.getByRole('button',{name:'Create my voice',exact:true}).click();return page.getByRole('dialog',{name:'Create my voice'});}

test('personal voice upload stays explicit, previews from memory, and joins downloaded voices',async({page})=>{
  await page.setViewportSize({width:390,height:844});await fixture(page);const dialog=await openCreate(page);await expect(dialog.getByRole('button',{name:'Close Create my voice'})).toBeFocused();
  expect(await page.evaluate(()=>(window as any).createVoiceState)).toMatchObject({prepareCalls:0,createCalls:0});
  await dialog.locator('#personal-voice-wav').setInputFiles({name:'Warm sample.wav',mimeType:'audio/wav',buffer:wav()});
  await expect(dialog.getByText('Sample ready')).toBeVisible();await dialog.getByRole('button',{name:'Preview sample'}).click();
  await dialog.getByRole('checkbox',{name:'Use your own voice or one you have permission to use'}).check();await dialog.getByRole('button',{name:'Create my voice',exact:true}).click();
  await expect(dialog.getByText('Warm sample is ready on this device.')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).createVoiceState)).toMatchObject({prepareCalls:0,createCalls:1,wavHeader:'RIFF',samplePreviews:1});
  await dialog.getByRole('button',{name:'Close Create my voice'}).click();const settings=page.getByRole('dialog',{name:'Device speech settings'});await expect(settings.getByRole('button',{name:'Create my voice',exact:true})).toBeFocused();
  await expect(settings.getByLabel('Voice',{exact:true})).toHaveValue('personal-1');await expect(settings.getByText('Personal voice · this device',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await settings.getByRole('button',{name:'Preview',exact:true}).click();await settings.getByRole('button',{name:'Use by default',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).createVoiceState)).toMatchObject({previewIds:['personal-1'],defaultVoice:'personal-1'});
  await settings.getByRole('button',{name:'Create my voice',exact:true}).click();const manage=page.getByRole('dialog',{name:'Create my voice'});await manage.getByRole('button',{name:'Remove',exact:true}).click();
  const confirmation=manage.getByLabel('Type Warm sample to confirm');await confirmation.fill('Warm sample');await manage.getByRole('button',{name:'Remove Warm sample'}).click();await expect(manage.getByText('Warm sample',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).createVoiceState.removeCalls)).toBe(1);await manage.getByRole('button',{name:'Close Create my voice'}).click();await expect(settings.getByLabel('Voice',{exact:true})).toHaveValue('marius');
});

test('preparation and processing start only on request and processing can be cancelled',async({page})=>{
  await fixture(page,{setupReady:false,delayedCreate:true});const dialog=await openCreate(page);
  await expect(dialog.getByRole('button',{name:'Prepare voice creation'})).toBeVisible();expect(await page.evaluate(()=>(window as any).createVoiceState.prepareCalls)).toBe(0);
  await dialog.getByRole('button',{name:'Prepare voice creation'}).click();await expect(dialog.getByRole('button',{name:'Record sample'})).toBeVisible();expect(await page.evaluate(()=>(window as any).createVoiceState.prepareCalls)).toBe(1);
  await dialog.locator('#personal-voice-wav').setInputFiles({name:'sample.wav',mimeType:'audio/wav',buffer:wav()});await dialog.getByRole('checkbox',{name:'Use your own voice or one you have permission to use'}).check();await dialog.getByRole('button',{name:'Create my voice',exact:true}).click();
  await expect(dialog.getByText('Creating your voice…')).toBeVisible();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog.getByText('Sample ready')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).createVoiceState)).toMatchObject({createCalls:1,createAborts:1,saved:[]});
  const tooLarge=Buffer.alloc(10_000_001);await dialog.locator('#personal-voice-wav').setInputFiles({name:'large.wav',mimeType:'audio/wav',buffer:tooLarge});await expect(dialog.getByRole('alert')).toHaveText('Choose a PCM WAV file up to 10 MB.');
  await dialog.getByRole('button',{name:'Close Create my voice'}).focus();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Device speech settings'})).toBeVisible();await expect(page.getByRole('button',{name:'Create my voice',exact:true})).toBeFocused();
});

test('recording encodes bounded PCM WAV and a late permission result is stopped after close',async({page})=>{
  await fixture(page,{recordingMock:true});
  const dialog=await openCreate(page);await dialog.getByRole('button',{name:'Record sample'}).click();await expect(dialog.getByText(/Recording/)).toBeVisible();
  await page.evaluate(()=>{const samples=new Float32Array(16000).fill(.25);(window as any).voiceProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>samples}});});await dialog.getByRole('button',{name:'Stop recording'}).click();await expect(dialog.getByText('Sample ready')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).createVoiceState)).toMatchObject({trackStops:1,contextCloses:1});await dialog.getByRole('checkbox',{name:'Use your own voice or one you have permission to use'}).check();await dialog.getByRole('button',{name:'Create my voice',exact:true}).click();await expect(dialog.getByText('Recorded sample is ready on this device.')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).createVoiceState)).toMatchObject({createCalls:1,wavHeader:'RIFF',wavBytes:32044});

  await dialog.getByRole('button',{name:'Close Create my voice'}).click();await page.getByRole('button',{name:'Create my voice',exact:true}).click();const pending=page.getByRole('dialog',{name:'Create my voice'});
  await page.evaluate(()=>{let release!:()=>void;const state=(window as any).createVoiceState,stream={getTracks:()=>[{stop(){state.trackStops++;}}]};Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{await new Promise<void>(resolve=>release=resolve);return stream;}}});(window as any).releaseVoicePermission=()=>release();});
  await pending.getByRole('button',{name:'Record sample'}).click();await expect(pending.getByText('Asking for microphone permission…')).toBeVisible();await pending.getByRole('button',{name:'Close Create my voice'}).click();await page.evaluate(()=>(window as any).releaseVoicePermission());
  await expect.poll(()=>page.evaluate(()=>(window as any).createVoiceState.trackStops)).toBe(2);
});


test('closing during microphone teardown cannot recreate a raw sample or start another recording',async({page})=>{
  await fixture(page,{recordingMock:true,delayedClose:true});const dialog=await openCreate(page);
  await dialog.getByRole('button',{name:'Record sample'}).click();
  await page.evaluate(()=>{(window as any).voiceProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(16000).fill(.2)}});});
  const before=await page.evaluate(()=>(window as any).createVoiceState.objectUrls);
  await dialog.getByRole('button',{name:'Stop recording'}).click();
  await expect(dialog.getByRole('button',{name:'Record sample'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Close Create my voice'}).click();
  await page.evaluate(()=>(window as any).releaseVoiceContextClose());
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).createVoiceState)).toMatchObject({objectUrls:before,trackStops:1,contextCloses:1,createCalls:0});
});
