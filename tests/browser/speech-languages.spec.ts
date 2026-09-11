import {test,expect,type Page} from '@playwright/test';

async function languageFixture(page:Page){
  await page.addInitScript(()=>{
    const voices={en:[{id:'alba',name:'Alba',locale:'en-US',gender:'female',grade:'Example',bytes:100,sha256:''}],es:[{id:'es-example',name:'Spanish example',locale:'es',gender:'female',grade:'Example',bytes:100,sha256:''}]};
    type Language=keyof typeof voices;
    let selected:Language='en';const installed=new Set<Language>(['en']);const downloaded=new Set(['alba']);
    const state={installs:[] as string[],removes:[] as string[],selections:[] as string[],voiceInstalls:[] as string[],legacyInstalls:0,defaultVoice:{en:'alba',es:'es-example'}};
    const status=(id:Language)=>({model:installed.has(id)?'ready':'not-installed',modelBytes:{installed:installed.has(id)?200:0,total:200},installedVoices:voices[id].filter(v=>downloaded.has(v.id)).map(v=>v.id),defaultVoice:state.defaultVoice[id]});
    let delayEnglish=false,releaseEnglish:()=>void=()=>{};
    const tts={
      languages:{list:()=>[{id:'en',name:'English',bytes:200},{id:'es',name:'Spanish',bytes:200}],getSelected:()=>selected,select(id:Language){selected=id;state.selections.push(id);},async getState(id:Language){return {...status(id),voices:voices[id]};},async install(id:Language){state.installs.push(id);installed.add(id);},async remove(id:Language){state.removes.push(id);installed.delete(id);for(const v of voices[id])downloaded.delete(v.id);}},
      getInstallState:async()=>status(selected),listVoices:()=>voices[selected],getDefaultVoice:()=>state.defaultVoice[selected],setDefaultVoice(id:string){state.defaultVoice[selected]=id;},async installVoice(id:string){state.voiceInstalls.push(id);downloaded.add(id);},async removeVoice(id:string){downloaded.delete(id);},async installModel(){state.legacyInstalls++;},async removeModel(){throw Error('Use the language removal API.');},getReadingMode:()=> 'download',setReadingMode(){},getVoiceLibraryState:async()=>{const id=selected;if(delayEnglish&&id==='en')await new Promise<void>(resolve=>releaseEnglish=resolve);return {ready:id==='en'?false:installed.has(id),bytes:200,voices:voices[id]};},cancel(){},dispose(){},async synthesize(){return {sampleRate:24000,chunks:0,sampleCount:0};},async previewVoice(){return {sampleRate:24000,chunks:0,sampleCount:0};},
      privateVoices:{list:async()=>[],prepare:async()=>{},getSetupState:async()=>status('en'),create:async()=>{},remove:async()=>{}},
    };
    Object.assign(window,{languageFixture:state,languageControl:{delay(){delayEnglish=true;},release(){releaseEnglish();}},notesSpeechFixture:{version:1,tts,status:async()=>({installed:false,bytes:0}),install:async()=>{},remove:async()=>{},start:async()=>({stop:async()=>{},cancel(){}}),dispose(){}}});
  });
}

test('language packs are explicit downloads and preserve other language voices across settings reopen',async({page})=>{
  await languageFixture(page);
  await page.goto('/');await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Device speech settings'});const language=dialog.getByRole('combobox',{name:'Language',exact:true});
  await expect(language).toHaveValue('en');await language.selectOption('es');
  await expect(dialog.getByRole('button',{name:/Set up reading/})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Create my voice'})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).languageFixture)).toMatchObject({installs:[],selections:['es'],legacyInstalls:0});
  await dialog.getByRole('button',{name:/Set up reading/}).click();
  await dialog.getByRole('button',{name:'Download voice',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Preview',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Close speech settings'}).click();
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  await expect(language).toHaveValue('es');await expect(dialog.getByLabel('Choose a voice')).toHaveValue('es-example');
  await dialog.getByRole('button',{name:'Remove reading download',exact:true}).click();
  await language.selectOption('en');await expect(dialog.getByRole('button',{name:'Preview',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).languageFixture)).toMatchObject({installs:['es'],removes:['es'],voiceInstalls:['es-example'],legacyInstalls:0});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/speech-language-mobile.png'});
});


test('late English catalog cannot replace the newly selected Spanish library',async({page})=>{
  await languageFixture(page);await page.goto('/');
  await page.getByRole('button',{name:'Device speech settings',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Device speech settings'});
  await page.evaluate(()=>(window as any).languageControl.delay());
  await dialog.getByRole('button',{name:'Browse voices',exact:true}).click();
  await expect(dialog.getByText('Checking available voices…')).toBeVisible();
  await dialog.getByRole('combobox',{name:'Language',exact:true}).selectOption('es');
  await dialog.getByRole('button',{name:/Set up reading/}).click();
  await dialog.getByRole('button',{name:'Browse voices',exact:true}).click();
  const catalog=dialog.getByRole('region',{name:'Voice library',exact:true});
  await expect(catalog.getByText('Spanish example',{exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).languageControl.release());
  await expect(catalog.getByRole('button',{name:/Prepare voice library/})).toHaveCount(0);
  await expect(catalog.getByText('Spanish example',{exact:true})).toBeVisible();
});
