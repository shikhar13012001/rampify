/** Peak envelope from actual decoded PCM; no synthetic audio representation. */
export function audioEnvelope(pcm:Float32Array,bins:number):Float32Array {
 if(!Number.isInteger(bins)||bins<1||bins>16384)throw new Error('Invalid waveform bin count');
 const result=new Float32Array(bins);
 for(let i=0;i<pcm.length;i++){const bin=Math.min(bins-1,Math.floor(i*bins/pcm.length));result[bin]=Math.max(result[bin],Math.min(1,Math.abs(pcm[i])));}
 return result;
}
