import {createRequire} from 'node:module';import {resolve} from 'node:path';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require(resolve(process.env.RAMPCUT_PLAYWRIGHT_MODULE||'.venv-skyvern/Lib/site-packages/playwright/driver/package'));}
const browser=await playwright.chromium.launch({headless:true}),page=await browser.newPage();
const settings={audioSettings:{preservePitch:true},blurSettings:{enabled:false,intensity:'balanced'},opticalFlowSettings:{enabled:false,quality:'draft'},cropSettings:{enabled:false,preset:'original'},colorSettings:{enabled:false,preset:'none'},captionSettings:{enabled:false},resolution:'1080p'};
const clip=id=>({id,file:{name:`saved-${id}.mp4`,duration:2,width:320,height:240},segments:[{id:'segment',startTime:0,endTime:2,curve:{type:'linear',points:[{time:0,speed:1},{time:1,speed:1}]}}],captionCues:[],captionSettings:{enabled:false}});
const raw=JSON.stringify({schemaVersion:2,savedAt:123,activeClipId:'a',clips:[clip('a'),clip('b')],settings,beatMarkers:[]});
try {
 await page.addInitScript(value=>localStorage.setItem('rampcut_project_v2',value),raw);
 await page.goto((process.env.RAMPCUT_BASE_URL||'http://127.0.0.1:5173')+'/editor?rampcut_test=1',{waitUntil:'commit',timeout:120000});
 await page.getByRole('button',{name:'Open project',exact:true}).waitFor({timeout:10000});
 assert.equal(await page.evaluate(()=>localStorage.getItem('rampcut_project_v2')),raw,'Empty editor must not overwrite saved work');
 await page.getByRole('button',{name:'Recover autosave',exact:true}).click();
 await page.getByRole('button',{name:'Relink source',exact:true}).waitFor();
 await page.getByText('saved-a.mp4',{exact:false}).first().waitFor();
 await page.getByText('saved-b.mp4',{exact:false}).first().waitFor();
 const recovered=JSON.parse(await page.evaluate(()=>localStorage.getItem('rampcut_project_v2')));
 assert.equal(recovered.clips.length,2);
 console.log('PASS empty-editor recovery exposes controls and preserves both missing source clips');
} finally {await browser.close();}
