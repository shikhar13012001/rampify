import { it, expect, vi } from 'vitest';
import { createExportCoordinator } from './exportCoordinator';
import type { ExportJob } from './exportCoordinator';
import type { ExportEngine } from './ExportEngine';
const job: ExportJob = {id:'job',clips:[{id:'c',file:{name:'clip',url:'blob:clip',duration:2,width:640,height:360},segments:[{id:'s',startTime:0,endTime:2,curve:{type:'linear',points:[{time:0,speed:1},{time:1,speed:1}]}}]}],settings:{resolution:'1080p',audioSettings:{preservePitch:true},blurSettings:{enabled:false,intensity:'balanced'},opticalFlowSettings:{enabled:false,quality:'draft'}}};
function engine(start:ExportEngine['start']):ExportEngine{return {kind:'local-wasm',supports:()=>true,start,cancel:vi.fn()};}
it('rejects a blocked job without creating a worker/engine',async()=>{
 const factory=vi.fn();const run=createExportCoordinator({check:async()=>({ok:false,code:'plan',message:'Blocked'}),engine:factory});
 await expect(run(job,()=>{},new AbortController().signal)).rejects.toThrow('Blocked');expect(factory).not.toHaveBeenCalled();
});
it('aborts pending preflight and frees the slot without starting later',async()=>{
 let finish!:(value:{ok:true})=>void;const factory=vi.fn();let pending=true;
 const run=createExportCoordinator({check:()=>pending?new Promise(r=>{finish=r;}):Promise.resolve({ok:false,code:'test',message:'next'}),engine:factory});
 const c=new AbortController(),p=run(job,()=>{},c.signal);c.abort();await expect(p).rejects.toMatchObject({name:'AbortError'});
 pending=false;await expect(run(job,()=>{},new AbortController().signal)).rejects.toThrow('next');finish({ok:true});await Promise.resolve();expect(factory).not.toHaveBeenCalled();
});
it('snapshots settings, rejects concurrent work and releases on render abort',async()=>{
 const start=vi.fn<ExportEngine['start']>(()=>new Promise(()=>{}));const e=engine(start),run=createExportCoordinator({check:async()=>({ok:true}),engine:()=>e});
 const copy=structuredClone(job),c=new AbortController(),p=run(copy,()=>{},c.signal);copy.settings.audioSettings.preservePitch=false;await Promise.resolve();await Promise.resolve();
 await expect(run(job,()=>{},new AbortController().signal)).rejects.toThrow('Another export');expect(start.mock.calls[0][0].audioSettings.preservePitch).toBe(true);
 c.abort();await expect(p).rejects.toMatchObject({name:'AbortError'});expect(e.cancel).toHaveBeenCalledOnce();
});
it('returns an artifact and releases after success',async()=>{
 const e=engine(async()=>({blob:new Blob(['test'])})),run=createExportCoordinator({check:async()=>({ok:true}),engine:()=>e});
 const result=await run(job,()=>{},new AbortController().signal);expect(result.duration).toBe(2);expect(result.width).toBe(640);expect(e.cancel).toHaveBeenCalledOnce();
 await expect(run(job,()=>{},new AbortController().signal)).resolves.toMatchObject({id:'job'});
});

it('binds artifacts to the account that passed preflight and rejects an account change during it',async()=>{
 let owner:string|null='account-a';const e=engine(async()=>({blob:new Blob(['file'])}));
 const run=createExportCoordinator({check:async()=>({ok:true}),engine:()=>e,owner:()=>owner});
 expect((await run(job,()=>{},new AbortController().signal)).ownerUid).toBe('account-a');
 const changed=createExportCoordinator({check:async()=>{owner='account-b';return {ok:true};},engine:vi.fn(),owner:()=>owner});owner='account-a';await expect(changed(job,()=>{},new AbortController().signal)).rejects.toThrow(/account changed/i);
});
