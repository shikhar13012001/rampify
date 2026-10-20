import {reduceEntitlements,type BillingFact,type BillingEnvironment} from './_billingState.js';
export interface BillingAuditInput {snapshotComplete:boolean;environment:BillingEnvironment;users:{uid:string;subscriptionTier?:string;plan?:string;dodoCustomerId?:string}[];facts:BillingFact[];reservations:{uid:string;state:string;sessionId?:string}[]}
/** Offline/read-only proposal. This function cannot contact Firestore or a provider. */
export function auditBillingSnapshot(input:BillingAuditInput,now=new Date()){
 const issues:string[]=[],unmappedUsers:string[]=[],pendingReservations:string[]=[];
 if(!input.snapshotComplete)issues.push('Incomplete source snapshot');
 if(new Set(input.users.map(u=>u.uid)).size!==input.users.length)issues.push('Duplicate user identity');
 const known=new Set(input.users.map(u=>u.uid));let sold=0;
 for(const fact of input.facts)if(fact.environment===input.environment&&!known.has(fact.uid))issues.push('Fact has no account mapping');
 for(const user of input.users){
  const facts=input.facts.filter(f=>f.uid===user.uid&&f.environment===input.environment),state=reduceEntitlements(facts,now,input.environment);
  if(state.isFounder)sold++;
  if(user.subscriptionTier==='pro'&&!state.isPro)unmappedUsers.push(user.uid);
  if(state.reconciliation.length)issues.push('Refund or legacy period requires review');
 }
 for(const reservation of input.reservations)if(['creating','created','uncertain'].includes(reservation.state))pendingReservations.push(reservation.uid);
 if(unmappedUsers.length)issues.push('Legacy access has no verified current grant');
 if(pendingReservations.length)issues.push('Pending checkout status needs provider reconciliation');
 if(sold>25)issues.push('Verified founder grants exceed the published cap');
 return {environment:input.environment,generatedAt:now.toISOString(),canInitialize:issues.length===0,proposedInventory:{inventoryVersion:1,environment:input.environment,sold,pending:pendingReservations.length},unmappedUsers,pendingReservations,issues:[...new Set(issues)]};
}
