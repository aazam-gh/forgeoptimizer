import { describe, expect, it } from 'vitest';
import { createWorkflowState, markOptimizationReverted, recordOptimizationCommit, unappliedCandidates, workflowReport } from './gitWorkflow';
import type { Candidate } from './domain';

const candidate=(id:string):Candidate=>({id,usageId:id,file:'src/app.ts',line:1,category:'Context reduction',title:`Candidate ${id}`,finding:'finding',recommendation:'recommendation',savingsPercent:10,confidence:'HIGH',risk:'LOW',removesAi:false,diff:''});
const branch={baseBranch:'main',baseCommitSha:'a'.repeat(40),optimizationBranch:'forgeoptimizer/run-abcd'};

describe('isolated Git workflow state',()=>{
  it('records idempotent candidate commits and produces a report',()=>{
    let state=createWorkflowState(branch);state=recordOptimizationCommit(state,candidate('a'),'b'.repeat(40));state=recordOptimizationCommit(state,candidate('a'),'c'.repeat(40));
    expect(state.currentCommitSha).toBe('b'.repeat(40));
    expect(unappliedCandidates(state,[candidate('a'),candidate('b')]).map(item=>item.id)).toEqual(['b']);
    expect(workflowReport(state)).toMatchObject({baseCommitSha:'a'.repeat(40),resultingCommitSha:'b'.repeat(40),appliedCandidates:['a']});
  });

  it('marks only the failed candidate reverted so later work can continue',()=>{
    let state=recordOptimizationCommit(createWorkflowState(branch),candidate('a'),'b'.repeat(40));
    state=recordOptimizationCommit(state,candidate('b'),'c'.repeat(40));state=markOptimizationReverted(state,'a','evaluation failed');
    expect(workflowReport(state)).toMatchObject({appliedCandidates:['b'],revertedCandidates:['a']});
  });
});
