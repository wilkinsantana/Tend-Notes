import {test,expect} from 'bun:test';
import {SpeechReplay} from '../src/speechReplay';
import type {SpeechTts} from '../src/host';
function fixture() {
  let calls=0;
  const tts={getDefaultVoice:()=> 'af_heart',async synthesize(options:any){calls++;await options.onChunk({index:0,pcm:new Float32Array([.1,.2]).buffer,sampleRate:24000,sampleCount:2});return {sampleRate:24000,chunks:1,sampleCount:2};}} as SpeechTts;
  return {tts,calls:()=>calls};
}
test('replays identical text without synthesis and invalidates voice, speed and text changes',async()=>{
  const f=fixture(), cache=new SpeechReplay();
  const options={text:'Hello.',onChunk:async(chunk:any)=>{new Float32Array(chunk.pcm)[0]=0;}};
  await cache.speak(f.tts,options);await cache.speak(f.tts,options);expect(f.calls()).toBe(1);
  await cache.speak(f.tts,{...options,text:'Changed.'});
  await cache.speak(f.tts,{...options,text:'Changed.',voice:'bf_emma'});
  await cache.speak(f.tts,{...options,text:'Changed.',voice:'bf_emma',speed:1.2});expect(f.calls()).toBe(4);
  cache.clear();await cache.speak(f.tts,options);expect(f.calls()).toBe(5);
});
test('oversized readings and failed playback are never cached',async()=>{
  const f=fixture(), cache=new SpeechReplay(4), options={text:'Hello.',onChunk:async()=>{}};
  await cache.speak(f.tts,options);await cache.speak(f.tts,options);expect(f.calls()).toBe(2);
  const other=new SpeechReplay();
  await expect(other.speak(f.tts,{...options,onChunk:()=>{throw Error('audio failed');}})).rejects.toThrow('audio failed');
  await other.speak(f.tts,options);expect(f.calls()).toBe(4);
});
test('clearing during synthesis prevents late cache publication',async()=>{
  const f=fixture(), cache=new SpeechReplay(), options={text:'Hello.',onChunk:async()=>{cache.clear();}};
  await expect(cache.speak(f.tts,options)).rejects.toThrow('stopped');
  await cache.speak(f.tts,{...options,onChunk:async()=>{}});expect(f.calls()).toBe(2);
});
test('cached playback respects cancellation between chunks',async()=>{
  const f=fixture(), cache=new SpeechReplay();await cache.speak(f.tts,{text:'Hello.',onChunk:async()=>{}});
  const request=new AbortController();
  await expect(cache.speak(f.tts,{text:'Hello.',signal:request.signal,onChunk:async()=>{request.abort();}})).rejects.toThrow('stopped');
  expect(f.calls()).toBe(1);
});

test('synthesizes only changed paragraphs in one batch and preserves current order',async()=>{
  const batches:string[][]=[];
  const tts={supportsSegments:true,getDefaultVoice:()=> 'af_heart',async synthesize(o:any){
    batches.push(o.segments);
    for(let i=0;i<o.segments.length;i++) await o.onChunk({segmentIndex:i,index:i,pcm:new Float32Array([o.segments[i].charCodeAt(0)]).buffer,sampleRate:24000,sampleCount:1});
    return {sampleRate:24000,chunks:o.segments.length,sampleCount:o.segments.length};
  }} as SpeechTts;
  const cache=new SpeechReplay();let spoken:number[]=[];
  const onChunk=async(c:any)=>{spoken.push(new Float32Array(c.pcm)[0]);};
  await cache.speak(tts,{text:'Alpha\nBeta\nCharlie',onChunk});
  await cache.speak(tts,{text:'Alpha',onChunk},true);
  expect(batches).toHaveLength(1);
  spoken=[];await cache.speak(tts,{text:'Alpha\nDelta\nCharlie',onChunk});
  expect(batches).toEqual([['Alpha','Beta','Charlie'],['Delta']]);
  expect(spoken).toEqual([65,68,67]);
  spoken=[];await cache.speak(tts,{text:'Charlie\nAlpha\nCharlie',onChunk});
  expect(batches).toHaveLength(2);expect(spoken).toEqual([67,65,67]);
});

test('aggregate paragraph cache stays within budget and cancelled partial paragraph is regenerated',async()=>{
  let count=0;
  const tts={supportsSegments:true,getDefaultVoice:()=> 'af_heart',async synthesize(o:any){count++;for(let i=0;i<o.segments.length;i++) await o.onChunk({segmentIndex:i,index:i,pcm:new Float32Array([.1,.2]).buffer,sampleRate:24000,sampleCount:2});return {sampleRate:24000,chunks:2,sampleCount:4};}} as SpeechTts;
  const cache=new SpeechReplay(8);const onChunk=async()=>{};
  await cache.speak(tts,{text:'Alpha\nBeta',onChunk});
  await cache.speak(tts,{text:'Alpha\nBeta',onChunk});expect(count).toBe(2);
  const request=new AbortController();
  await expect(cache.speak(tts,{text:'Delta',signal:request.signal,onChunk:async()=>{request.abort();}})).rejects.toThrow();
  await cache.speak(tts,{text:'Delta',onChunk});expect(count).toBe(4);
});
