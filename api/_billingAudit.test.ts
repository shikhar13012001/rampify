import {it,expect} from 'vitest';import {auditBillingSnapshot} from './_billingAudit.js';
it('does not infer zero paid seats from missing or incomplete evidence',()=>{
 const report=auditBillingSnapshot({snapshotComplete:false,environment:'test_mode',users:[{uid:'old',subscriptionTier:'pro',plan:'founder'}],facts:[],reservations:[]});expect(report.canInitialize).toBe(false);expect(report.unmappedUsers).toEqual(['old']);
});
it('holds uncertain checkout outcomes for provider reconciliation',()=>{
 const report=auditBillingSnapshot({snapshotComplete:true,environment:'test_mode',users:[],facts:[],reservations:[{uid:'x',state:'uncertain'}]});expect(report.canInitialize).toBe(false);expect(report.proposedInventory.pending).toBe(1);
});
