import {describe,it,expect} from 'vitest';
import {buildSoundtrackFilter,validateSoundtrack} from './soundtrack';
const track={name:'music.wav',url:'blob:music',duration:10,size:100,fingerprint:'abc',trimStart:1,trimEnd:5,offset:2,gain:.5,sourceGain:.5};
describe('final output soundtrack',()=>{
 it('trims music before placing it on output time and bounds both inputs',()=>{const graph=buildSoundtrackFilter(track,8);expect(graph).toContain('atrim=start=1:end=5,asetpts=N/SR/TB');expect(graph).toContain('adelay=2000:all=1');expect(graph.match(/atrim=duration=8/g)).toHaveLength(3);});
 it('uses fixed headroom for two full-scale sources',()=>expect(buildSoundtrackFilter({...track,gain:1,sourceGain:1},8).match(/volume=0.5/g)).toHaveLength(2));
 it.each([{url:''},{trimEnd:11},{offset:8},{gain:NaN},{duration:121}])('rejects unavailable or invalid music %j',patch=>expect(()=>validateSoundtrack({...track,...patch},8)).toThrow());
});
