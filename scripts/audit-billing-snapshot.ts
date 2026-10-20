/** Offline proposal only. Never loads credentials or writes provider/database state. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';
import {auditBillingSnapshot,type BillingAuditInput} from '../api/_billingAudit.js';
const file=process.argv[2];if(!file)throw new Error('Usage: node node_modules/tsx/dist/cli.mjs scripts/audit-billing-snapshot.ts PATH_TO_REVIEWED_MINIMAL_SNAPSHOT.json');
const raw=readFileSync(resolve(file),'utf8');if(Buffer.byteLength(raw)>16*1024*1024)throw new Error('Snapshot exceeds16MiB; split it for review.');
const data=JSON.parse(raw) as BillingAuditInput;if(!['test_mode','live_mode'].includes(data.environment)||!Array.isArray(data.users)||!Array.isArray(data.facts)||!Array.isArray(data.reservations)||typeof data.snapshotComplete!=='boolean')throw new Error('Invalid minimal snapshot shape');
const report=auditBillingSnapshot(data);mkdirSync('temp/billing-audit',{recursive:true});writeFileSync('temp/billing-audit/proposal.json',JSON.stringify(report,null,2));console.log(JSON.stringify({canInitialize:report.canInitialize,issues:report.issues.length,unmappedUsers:report.unmappedUsers.length,pendingReservations:report.pendingReservations.length,report:'temp/billing-audit/proposal.json'}));
