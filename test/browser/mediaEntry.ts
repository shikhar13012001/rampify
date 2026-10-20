import {LocalWasmEngine} from '../../src/lib/LocalWasmEngine';
(window as unknown as {__MediaEngine:typeof LocalWasmEngine}).__MediaEngine=LocalWasmEngine;
import MotionBlurWorker from '../../src/workers/motionBlurWorker.ts?worker';
(window as unknown as {__BlurWorker:typeof MotionBlurWorker}).__BlurWorker=MotionBlurWorker;
