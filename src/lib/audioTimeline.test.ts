import {it,expect} from 'vitest';import {audioEnvelope} from './audioTimeline';
it('draws silence as silence and retains real click location',()=>{
 expect([...audioEnvelope(new Float32Array(100),10)]).toEqual(Array(10).fill(0));
 const pcm=new Float32Array(100);pcm[42]=1;const peaks=audioEnvelope(pcm,10);expect(peaks[4]).toBe(1);expect(peaks[0]).toBe(0);
});
