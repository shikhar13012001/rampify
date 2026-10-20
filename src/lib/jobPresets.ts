import {z} from 'zod';import {curveSchema,settingsSchema} from './projectManifest';import type {SpeedCurve} from '@/types/editor';
const schema=z.object({version:z.literal(1),id:z.string(),name:z.string().trim().min(1).max(64),curve:curveSchema,settings:settingsSchema});
export type JobPreset=z.infer<typeof schema>;
export function createPreset(name:string,curve:SpeedCurve,settings:z.infer<typeof settingsSchema>):JobPreset{return schema.parse({version:1,id:crypto.randomUUID(),name,curve,settings});}
export function parsePreset(raw:string):JobPreset{if(raw.length>65536)throw new Error('Preset too large');return schema.parse(JSON.parse(raw));}
const key='rampcut:job-presets:v1';
export function readPresets():JobPreset[]{const raw=localStorage.getItem(key);if(!raw)return [];return z.array(schema).max(100).parse(JSON.parse(raw));}
export function storePreset(preset:JobPreset):void{const items=readPresets().filter(p=>p.id!==preset.id);if(items.length>=100)throw new Error('Preset limit reached');localStorage.setItem(key,JSON.stringify([...items,schema.parse(preset)]));}
export function deletePreset(id:string):void{localStorage.setItem(key,JSON.stringify(readPresets().filter(p=>p.id!==id)));}
