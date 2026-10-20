import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({resolve:{alias:{'@':resolve('src')}},worker:{format:'iife'},assetsInclude:['**/*.wasm'],build:{outDir:'temp/browser/media-dist',rollupOptions:{input:resolve('test/browser/media.html')}},preview:{host:'127.0.0.1',port:5176,strictPort:true,headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'credentialless'}}});
