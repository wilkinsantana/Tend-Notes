import { afterEach, expect, test } from 'bun:test';
import { createSpeechPlayback } from '../src/speechPlayback';
const original = globalThis.AudioContext;
class FakeContext {
  static latest: FakeContext;
  currentTime=0;state='running';destination={};onstatechange:(()=>void)|null=null;
  nodes:{buffer:unknown;onended:(()=>void)|null;at:number;stopped:boolean;connect():void;disconnect():void;start(at:number):void;stop():void}[]=[];
  constructor(){FakeContext.latest=this;}
  async resume(){this.state='running';} async suspend(){this.state='suspended';} async close(){this.state='closed';}
  createBuffer(){return {copyToChannel(){}};}
  createBufferSource(){const node={buffer:null as unknown,onended:null as (()=>void)|null,at:0,stopped:false,connect(){},disconnect(){},start(at:number){this.at=at;},stop(){this.stopped=true;}};this.nodes.push(node);return node;}
}
const audio={pcm:new Float32Array(24000).buffer,sampleRate:24000};
function fixture(){globalThis.AudioContext=FakeContext as unknown as typeof AudioContext;return createSpeechPlayback();}
afterEach(()=>{globalThis.AudioContext=original;});
test('prepares next audio during playback, schedules contiguous chunks and bounds the producer',async()=>{
 const p=fixture();await p.play(audio);await p.play(audio);
 const c=FakeContext.latest;expect(c.nodes.map(n=>n.at)).toEqual([0,1]);
 let queued=false;const third=p.play(audio).then(()=>{queued=true;});await Promise.resolve();
 expect(queued).toBe(false);expect(c.nodes).toHaveLength(2);
 await expect(p.play(audio)).rejects.toThrow('current speech segment');
 c.currentTime=1;c.nodes[0].onended?.();await third;
 expect(c.nodes[2].at).toBe(2);p.stop();
});
test('drain keeps final queued audio alive and pause preserves its scheduled timeline',async()=>{
 const p=fixture();await p.play(audio);await p.play(audio);const c=FakeContext.latest;
 let drained=false;const tail=p.drain().then(()=>{drained=true;});await Promise.resolve();expect(drained).toBe(false);
 await p.pause();expect(c.state).toBe('suspended');expect(c.nodes[1].at).toBe(1);
 await p.resume();c.currentTime=1;c.nodes[0].onended?.();await Promise.resolve();expect(drained).toBe(false);
 c.currentTime=2;c.nodes[1].onended?.();await tail;expect(drained).toBe(true);p.stop();
});
test('stop cancels scheduled audio and releases both pending producer and drain',async()=>{
 const p=fixture();await p.play(audio);await p.play(audio);
 const producer=p.play(audio);const tail=p.drain();
 p.stop();await expect(producer).rejects.toThrow('stopped');await tail;expect(FakeContext.latest.nodes.every(n=>n.stopped)).toBe(true);
 await expect(p.play(audio)).rejects.toThrow('stopped');p.stop();
});
test('rejects malformed, nonfinite and oversized PCM before playback',async()=>{
 const p=fixture();await expect(p.play({pcm:new ArrayBuffer(3),sampleRate:24000})).rejects.toThrow('invalid');
 await expect(p.play({pcm:new Float32Array([NaN]).buffer,sampleRate:24000})).rejects.toThrow('invalid samples');
 await expect(p.play({pcm:new ArrayBuffer(24000*121*4),sampleRate:24000})).rejects.toThrow('too large');p.stop();
});

test('observer failure cannot strand a waiting producer or tail cleanup',async()=>{
 globalThis.AudioContext=FakeContext as unknown as typeof AudioContext;
 const p=createSpeechPlayback(()=>{throw Error('observer failed');});
 await p.play(audio);await p.play(audio);const third=p.play(audio);
 await Promise.resolve();FakeContext.latest.currentTime=1;FakeContext.latest.nodes[0].onended?.();await third;
 p.stop();await p.drain();expect(FakeContext.latest.state).toBe('closed');
});

test('pause blocks queue admission until resume and stop releases a paused producer',async()=>{
 const p=fixture();await p.play(audio);await p.pause();
 let queued=false;const producer=p.play(audio).then(()=>{queued=true;});
 await Promise.resolve();await Promise.resolve();
 expect(queued).toBe(false);expect(FakeContext.latest.nodes).toHaveLength(1);
 await p.resume();await producer;expect(queued).toBe(true);p.stop();
 const second=fixture();await second.play(audio);await second.pause();
 const waiting=second.play(audio);await Promise.resolve();second.stop();
 await expect(waiting).rejects.toThrow('stopped');await second.drain();
});
