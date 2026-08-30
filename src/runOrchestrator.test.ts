import { describe, expect, it } from 'vitest';
import { executeOptimizationRun } from './runOrchestrator';
import type { Candidate, OptimizationScenario, Run } from './domain';

const scenario:OptimizationScenario={id:'tests',name:'tests',command:'pnpm test',cwd:'.',timeoutMs:1000,expectedExitStatus:0,category:'test',requiredEnv:[]};
const candidate=(id:string):Candidate=>({id,usageId:id,file:'src/app.ts',line:1,category:'Context reduction',title:id,finding:'finding',recommendation:'recommendation',savingsPercent:10,confidence:'HIGH',risk:'LOW',removesAi:false,diff:''});
const run:Run={id:'run-1',repositoryUrl:'fixture://app',status:'created',approvalStatus:'pending',createdAt:'2026-01-01T00:00:00.000Z',usages:[],candidates:[],before:{calls:0,tokens:0,cost:0,latencyMs:0,quality:'MEASURED'},events:[]};

describe('end-to-end optimization orchestration',()=>{
  it('runs baseline, applies candidates one at a time, and reverts a failing candidate',async()=>{
    const applied:string[]=[];const reverted:string[]=[];let calls=0;
    const result=await executeOptimizationRun(run,[candidate('a'),candidate('b')],{scenario,baselineCommitSha:'a'.repeat(40),sandbox:{execute:async request=>({scenarioId:request.scenario.id,status:request.commitSha==='c'.repeat(40)?'failed':'passed',quality:'MEASURED'})},applyCandidate:async current=>{applied.push(current.id);return{commitSha:current.id==='a'?'b'.repeat(40):'c'.repeat(40)};},revertCandidate:async current=>{reverted.push(current.id);},evaluateCandidate:async()=>{calls+=1;return[];}});
    expect(applied).toEqual(['a','b']);expect(reverted).toEqual(['b']);expect(result.workflow.commits.map(commit=>commit.status)).toEqual(['applied','reverted']);expect(result.run.status).toBe('awaiting_approval');expect(calls).toBe(2);
  });

  it('gates model-change candidates on measured benchmark evidence',async()=>{
    const modelCandidate={...candidate('model'),requiresBenchmark:true,changeType:'model' as const};
    const applied:string[]=[];
    const result=await executeOptimizationRun(run,[modelCandidate],{scenario,baselineCommitSha:'a'.repeat(40),sandbox:{execute:async request=>({scenarioId:request.scenario.id,status:'passed',quality:'MEASURED'})},applyCandidate:async current=>{applied.push(current.id);return{commitSha:'b'.repeat(40)};},revertCandidate:async()=>{},benchmarkCandidate:async()=>false});
    expect(applied).toEqual([]);
    expect(result.workflow.commits).toEqual([]);
    expect(result.validation.reasons).toEqual(expect.arrayContaining(['Behavioral evaluation evidence is incomplete or failing']));
  });
});
