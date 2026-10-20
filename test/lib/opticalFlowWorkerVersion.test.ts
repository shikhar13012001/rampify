import {it,expect} from 'vitest';import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
it('emits ONNX JS and WASM from the same installed package instead of a drifting CDN version',()=>{
 const source=readFileSync(resolve('src/workers/opticalFlowWorker.ts'),'utf8');
 for(const file of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']){expect(source).toContain('node_modules/onnxruntime-web/dist/'+file+'?url');expect(existsSync(resolve('node_modules/onnxruntime-web/dist/'+file))).toBe(true);}
 expect(source).not.toMatch(/wasmPaths\s*=\s*['"]https:/);expect(source).toContain("executionProviders: ['wasm']");
});
