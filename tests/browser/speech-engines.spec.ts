import {test, expect, type Page} from '@playwright/test';

async function engineFixture(page: Page) {
  await page.addInitScript(() => {
    const state = {engine:'kokoro', statusCalls:0, setCalls:[] as string[], modelInstalls:0, voiceInstalls:0};
    const voices = {
      kokoro:[{id:'heart',name:'Heart',locale:'en-US',gender:'female',grade:'A',bytes:100,sha256:''}],
      piper:[{id:'breeze',name:'Breeze',locale:'en-GB',gender:'male',grade:'A',bytes:100,sha256:''}],
    };
    const tts = {
      listEngines(){return [{id:'kokoro',name:'Kokoro',description:'Natural local voices'},{id:'piper',name:'Piper',description:'Compact local voices'}];},
      getEngine(){return state.engine;}, setEngine(id:string){state.engine=id;state.setCalls.push(id);},
      async getInstallState(){state.statusCalls++;return {model:'ready',modelBytes:{installed:100,total:100},installedVoices:[voices[state.engine as keyof typeof voices][0].id],defaultVoice:voices[state.engine as keyof typeof voices][0].id};},
      listVoices(){return voices[state.engine as keyof typeof voices];},
      async installModel(){state.modelInstalls++;}, async removeModel(){},
      async installVoice(){state.voiceInstalls++;}, async removeVoice(){},
      getDefaultVoice(){return voices[state.engine as keyof typeof voices][0].id;}, setDefaultVoice(){},
      async previewVoice(){return {sampleRate:24000 as const,chunks:0,sampleCount:0};}, async synthesize(){return {sampleRate:24000 as const,chunks:0,sampleCount:0};}, cancel(){}, dispose(){},
    };
    Object.assign(window,{speechEngineFixtureState:state,notesSpeechFixture:{version:1,tts,
      async status(){return {installed:false,bytes:0};}, async install(){}, async remove(){}, async start(){return {async stop(){},cancel(){}};},dispose(){},
    }});
  });
}

test('switching a local read-aloud engine refreshes status and voices without downloads',async({page})=>{
  await engineFixture(page); await page.goto('/');
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const settings = page.getByRole('dialog',{name:'Device speech settings'});
  const engine = settings.getByLabel('Engine',{exact:true});
  await expect(engine).toHaveValue('kokoro');
  await expect(settings.getByLabel('Voice',{exact:true})).toHaveValue('heart');
  await engine.selectOption('piper');
  await expect(settings.getByLabel('Voice',{exact:true})).toHaveValue('breeze');
  expect(await page.evaluate(() => (window as any).speechEngineFixtureState)).toMatchObject({engine:'piper',setCalls:['piper'],modelInstalls:0,voiceInstalls:0});
  expect(await page.evaluate(() => (window as any).speechEngineFixtureState.statusCalls)).toBeGreaterThan(1);
});
