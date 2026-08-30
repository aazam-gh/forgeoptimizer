import { describe, expect, it } from 'vitest';
import { budgetViolations, canSpend, defaultOptimizationBudget, emptyBudgetLedger } from './budget';

describe('optimization budgets',()=>{
  it('allows work below limits and rejects a spend that crosses one',()=>{const ledger=emptyBudgetLedger();expect(canSpend(defaultOptimizationBudget,ledger,{agentCost:1,runtimeMs:100})).toBe(true);expect(canSpend({...defaultOptimizationBudget,maxAgentCost:1},ledger,{agentCost:2})).toBe(false);});
  it('reports every exceeded budget dimension',()=>{expect(budgetViolations({...defaultOptimizationBudget,maxCandidates:1,maxSandboxExecutions:1},{...emptyBudgetLedger(),candidates:2,sandboxExecutions:2})).toEqual(['candidate budget exceeded','sandbox execution budget exceeded']);});
});
