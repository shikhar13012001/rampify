import {mergeConfig} from 'vite';
import appConfig from '../../vite.config';
// Disposable browser-test build. Real editor/worker/API code; only the existing
// DEV + explicit-window-flag Auth-emulator hook is retained for genuine sign-in.
// Never deploy this directory. Normal npm run build has neither override.
export default mergeConfig(appConfig,{
 cacheDir:'temp/browser/ui-vite-cache',
 define:{'import.meta.env.DEV':true},
 build:{outDir:'temp/browser/ui-dist'},
 preview:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:3001'}},
});
