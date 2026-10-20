import {createServer} from 'node:http';
import webhook from '../../api/webhooks/dodo.js';
import check from '../../api/check-subscription.js';import record from '../../api/record-export.js';import track from '../../api/track-event.js';import founder from '../../api/founder-seats.js';
import type {VercelRequest,VercelResponse} from '@vercel/node';
if(process.env.GCLOUD_PROJECT!=='demo-rampcut-test'||!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('Isolated emulator environment required');
const routes:Record<string,typeof check>={'/api/webhooks/dodo':webhook,'/api/check-subscription':check,'/api/record-export':record,'/api/track-event':track,'/api/founder-seats':founder};
createServer(async(req,res)=>{
 const handler=routes[new URL(req.url!,'http://127.0.0.1').pathname];if(!handler){res.writeHead(404).end();return;}
 try {
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)throw new Error('Body too large');}
  const request=Object.assign(req,{rawBody:Buffer.from(raw),body:raw?JSON.parse(raw):{},query:{}}) as VercelRequest;
  const response=Object.assign(res,{status(code:number){res.statusCode=code;return response;},json(value:unknown){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return response;}}) as VercelResponse;
  await handler(request,response);
 } catch(error){res.statusCode=500;res.end(JSON.stringify({error:error instanceof Error?error.message:'Test API failure'}));}
}).listen(3001,'127.0.0.1',()=>console.log('Isolated real API handlers ready'));
