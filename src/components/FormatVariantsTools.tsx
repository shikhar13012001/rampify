import {useState} from 'react';
import {useEditorStore} from '@/store/editorStore';
import {useBatchStore} from '@/store/batchStore';
import {formatVariants} from '@/lib/formatVariants';
import {BatchPanel} from '@/features/batch/BatchPanel';
import type {CropPreset} from '@/types/editor';
export function FormatVariantsTools(){
 const project=useEditorStore(s=>s.project),exporting=useEditorStore(s=>s.isExporting);
 const processing=useBatchStore(s=>s.isProcessing),synchronizing=useBatchStore(s=>s.isSynchronizing);
 const [formats,setFormats]=useState<CropPreset[]>(['9:16','1:1']),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[message,setMessage]=useState('');
 const queue=async()=>{
  setBusy(true);setMessage('');const urls:string[]=[];
  try{
   const s=useEditorStore.getState(),clip=s.clips.find(c=>c.id===s.activeClipId);if(!clip?.file.url)throw new Error('Relink the source before creating variants.');
   const variants=formatVariants({...clip,captionCues:s.captionCues,captionSettings:s.captionSettings},formats,s);
   if(useBatchStore.getState().clips.length+variants.length>10)throw new Error('The batch queue holds at most ten jobs.');
   const response=await fetch(clip.file.url);if(!response.ok)throw new Error('Source is unavailable.');const blob=await response.blob();
   if(useBatchStore.getState().isProcessing||useBatchStore.getState().isSynchronizing)throw new Error('Finish the current batch first.');
   for(const variant of variants){const url=URL.createObjectURL(blob);urls.push(url);variant.file.url=url;}
   for(const variant of variants)useBatchStore.getState().addClip(variant.file,variant.segments,{settings:variant.settings,captionCues:variant.captionCues,captionSettings:variant.captionSettings});
   urls.length=0;setOpen(true);
  }catch(error){setMessage(error instanceof Error?error.message:'Could not create variants.');}finally{urls.forEach(url=>URL.revokeObjectURL(url));setBusy(false);}
 };
 return <><section className="editor-tools-section" aria-label="Output formats">
  <div className="editor-tools-heading"><h2>Output formats</h2><span className="editor-tools-tag">{formats.length} selected</span></div>
  <fieldset className="editor-format-options"><legend>Separate deliverables</legend>{(['16:9','9:16','1:1','4:5'] as const).map(format=><label className="editor-format-option" key={format}>
    <span className="editor-format-shape" aria-hidden="true" style={{aspectRatio:format.replace(':',' / ')}}/>
    <span>{format}</span><input aria-label={format} type="checkbox" checked={formats.includes(format)} onChange={e=>setFormats(values=>e.target.checked?[...values,format]:values.filter(v=>v!==format))}/>
  </label>)}</fieldset>
  <button className="editor-tool-button editor-tool-button--primary" disabled={!project||!formats.length||busy||exporting||processing||synchronizing} onClick={()=>void queue()}>{busy?'Preparing variants…':'Queue format variants'}</button>
  <p className="editor-tool-help">Centered crops of the active clip. Each downloaded format uses one export.</p>
  {message&&<span className="editor-tool-status" role="status">{message}</span>}
 </section>{open&&<BatchPanel onClose={()=>setOpen(false)}/>}</>;
}
