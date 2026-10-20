import {it,expect} from 'vitest';
import {analyticsBudgetDecision} from '../../api/_analyticsBudget';
it('rejects above the durable global and session budgets',()=>{expect(analyticsBudgetDecision(1000,0)).toBe(false);expect(analyticsBudgetDecision(0,60)).toBe(false);expect(analyticsBudgetDecision(999,59)).toBe(true);});
