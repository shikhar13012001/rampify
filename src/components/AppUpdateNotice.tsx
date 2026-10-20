import {useState} from 'react';
import {usePwaUpdate,applyAppUpdate} from '@/lib/pwa';
import {canReloadForUpdate} from '@/lib/pwaPolicy';
import {saveProjectManifest} from '@/lib/projectPersistence';
import {useEditorStore} from '@/store/editorStore';
import {useBatchStore} from '@/store/batchStore';
export function AppUpdateNotice(){
 const available=usePwaUpdate(),exporting=useEditorStore(s=>s.isExporting),processing=useBatchStore(s=>s.isProcessing),hasProject=useEditorStore(s=>!!s.project);
 const pendingBatch=useBatchStore(s=>s.isSynchronizing||s.clips.some(c=>!['done','discarded'].includes(c.status)));
 const [applying,setApplying]=useState(false);
 const [error,setError]=useState('');if(!available)return null;
 return <aside role="status" style={{position:'fixed',bottom:16,left:16,zIndex:9999,padding:14,maxWidth:360,background:'#fffaf0',color:'#0a0a0a',border:'1px solid #d4cebf',borderRadius:10}}>
  <strong>Update available</strong><p>{hasProject?'Save your project, then reload. Keep the original media files for relinking after the update.':'Reload when you are ready to update.'}</p>
  <button disabled={exporting||processing||pendingBatch||applying} onClick={async()=>{const state=useEditorStore.getState();const saved=!state.project||saveProjectManifest(state);if(!canReloadForUpdate(state.isExporting,useBatchStore.getState().isProcessing,!!state.project,saved)){setError('Finish the export or save a project backup before updating.');return;}try{setApplying(true);await applyAppUpdate();}catch{setApplying(false);setError('Could not apply this update. Your current edit is still open.');}}}>{applying?'Applying update…':'Save and reload'}</button>
  {(exporting||processing||pendingBatch)&&<p>Finish exports and download or clear pending batch jobs before updating.</p>}
  {error&&<p>{error}</p>}
 </aside>;
}
