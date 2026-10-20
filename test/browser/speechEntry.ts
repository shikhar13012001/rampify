import CaptionWorker from '../../src/workers/captionWorker.ts?worker';
(window as unknown as {__CaptionWorker:typeof CaptionWorker}).__CaptionWorker=CaptionWorker;
