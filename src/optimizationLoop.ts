import type { Candidate, OptimizationBudget, OptimizationPlan, OptimizationPlanStep } from './domain';
import { canSpend, defaultOptimizationBudget, emptyBudgetLedger } from './budget';

export type CandidateAttempt={candidateId:string;status:'passed'|'reverted'|'skipped';detail:string;durationMs:number};
export type CandidateExecutor=(candidate:Candidate,step:OptimizationPlanStep)=>Promise<{passed:boolean;detail:string}>;
export type OptimizationLoopResult={plan:OptimizationPlan;attempts:CandidateAttempt[];acceptedCandidateIds:string[];remainingCandidateIds:string[];stopReason?:string};

export async function runOptimizationLoop(plan:OptimizationPlan,candidates:Candidate[],execute:CandidateExecutor,budget:OptimizationBudget=defaultOptimizationBudget):Promise<OptimizationLoopResult>{
  const byId=new Map(candidates.map(candidate=>[candidate.id,candidate]));
  const nextSteps=plan.steps.map(step=>({...step}));
  const attempts:CandidateAttempt[]=[];
  const accepted:string[]=[];
  const started=Date.now();
  let ledger=emptyBudgetLedger();
  let stopReason:string|undefined;
  for(const step of nextSteps){
    const candidate=byId.get(step.candidateId);
    if(!candidate){step.status='skipped';attempts.push({candidateId:step.candidateId,status:'skipped',detail:'Candidate is missing from the run snapshot',durationMs:0});continue;}
    const blockedDependency=step.dependsOn.find(dependencyId=>nextSteps.find(dependency=>dependency.id===dependencyId)?.status!=='passed');
    if(blockedDependency){step.status='skipped';const dependency=nextSteps.find(item=>item.id===blockedDependency);const detail=`Dependency ${dependency?.candidateId??blockedDependency} did not pass`;attempts.push({candidateId:candidate.id,status:'skipped',detail,durationMs:0});continue;}
    const elapsed=Date.now()-started;
    if(!canSpend(budget,ledger,{candidates:1,sandboxExecutions:1,runtimeMs:Math.max(0,elapsed-ledger.runtimeMs)})){step.status='skipped';stopReason='Optimization budget reached';attempts.push({candidateId:candidate.id,status:'skipped',detail:stopReason,durationMs:0});break;}
    step.status='running';
    const attemptStarted=Date.now();
    try{
      const result=await execute(candidate,step);
      const durationMs=Date.now()-attemptStarted;
      ledger={...ledger,candidates:ledger.candidates+1,sandboxExecutions:ledger.sandboxExecutions+1,runtimeMs:Date.now()-started};
      if(result.passed){step.status='passed';accepted.push(candidate.id);attempts.push({candidateId:candidate.id,status:'passed',detail:result.detail,durationMs});}
      else{step.status='reverted';attempts.push({candidateId:candidate.id,status:'reverted',detail:result.detail,durationMs});}
    }catch(error){
      const durationMs=Date.now()-attemptStarted;
      ledger={...ledger,candidates:ledger.candidates+1,sandboxExecutions:ledger.sandboxExecutions+1,runtimeMs:Date.now()-started};
      step.status='reverted';attempts.push({candidateId:candidate.id,status:'reverted',detail:error instanceof Error?error.message:'Candidate validation failed',durationMs});
    }
  }
  return{plan:{...plan,steps:nextSteps},attempts,acceptedCandidateIds:accepted,remainingCandidateIds:nextSteps.filter(step=>step.status==='queued').map(step=>step.candidateId),stopReason};
}
