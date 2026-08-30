import type { Candidate, EvaluationResult, OptimizationBudget, OptimizationScenario, Run, ScenarioExecutionResult } from './domain';
import { defaultOptimizationBudget } from './budget';
import { executeScenario, type SandboxExecutor } from './scenarios';
import { createWorkflowState, markOptimizationReverted, recordOptimizationCommit } from './gitWorkflow';
import { runOptimizationLoop } from './optimizationLoop';
import { assessValidationGate, type ValidationGateResult } from './validation';
import { transitionRun } from './runState';
import { validateCandidatePatch } from './patchValidation';

export type RunOrchestrationAdapters={scenario:OptimizationScenario;baselineCommitSha:string;sandbox:SandboxExecutor;applyCandidate:(candidate:Candidate)=>Promise<{commitSha:string}>;revertCandidate:(candidate:Candidate,commitSha:string)=>Promise<void>;evaluateCandidate?:(candidate:Candidate)=>Promise<EvaluationResult[]>};
export type RunOrchestrationResult={run:Run;baseline:ScenarioExecutionResult;candidateResults:ScenarioExecutionResult[];validation:ValidationGateResult;workflow:ReturnType<typeof createWorkflowState>};

function withStatus(run:Run,status:Run['status'],metadata:Parameters<typeof transitionRun>[2]={}):Run{return transitionRun(run,status,metadata);}

export async function executeOptimizationRun(initialRun:Run,candidates:Candidate[],adapters:RunOrchestrationAdapters,budget:OptimizationBudget=defaultOptimizationBudget):Promise<RunOrchestrationResult>{
  let run=withStatus(initialRun,'preparing',{stage:'preparing'});run=withStatus(run,'analyzing',{stage:'analyzing'});run=withStatus(run,'baseline_running',{stage:'baseline_running'});
  const baseline=await executeScenario(adapters.sandbox,{scenario:adapters.scenario,commitSha:adapters.baselineCommitSha,repositoryUrl:run.repositoryUrl});
  let workflow=createWorkflowState({baseBranch:'main',baseCommitSha:adapters.baselineCommitSha,optimizationBranch:`forgeoptimizer/run-${run.id.slice(0,8)}`});
  const evaluationResults:EvaluationResult[]=[];
  run=withStatus(run,'planning',{stage:'planning'});const candidateResults:ScenarioExecutionResult[]=[];
  const loop=await runOptimizationLoop({id:`plan-${run.id}`,runId:run.id,createdAt:new Date().toISOString(),steps:candidates.map(candidate=>({id:`step-${candidate.id}`,candidateId:candidate.id,title:candidate.title,dependsOn:[],score:0,status:'queued' as const})),expectedSavingsPercent:0,risk:'LOW',valid:true,validationErrors:[]},candidates,async candidate=>{const patch=validateCandidatePatch(candidate.diff);if(!patch.valid)return{passed:false,detail:`Patch rejected before application: ${patch.errors.join('; ')}`};run=withStatus(run,'optimizing',{stage:'optimizing',activeCandidateId:candidate.id});const applied=await adapters.applyCandidate(candidate);workflow=recordOptimizationCommit(workflow,candidate,applied.commitSha);const scenarioResult=await executeScenario(adapters.sandbox,{scenario:adapters.scenario,commitSha:applied.commitSha,repositoryUrl:run.repositoryUrl});candidateResults.push(scenarioResult);const evaluations=adapters.evaluateCandidate?await adapters.evaluateCandidate(candidate):[];evaluationResults.push(...evaluations);const passed=scenarioResult.status==='passed'&&scenarioResult.quality==='MEASURED'&&evaluations.every(result=>result.passed);if(!passed){await adapters.revertCandidate(candidate,applied.commitSha);workflow=markOptimizationReverted(workflow,candidate.id,'scenario or evaluation failed');}return{passed,detail:passed?'Scenario and evaluations passed':'Candidate reverted after validation failure'};},budget);
  run=withStatus(run,'validating',{stage:'validating'});const validation=assessValidationGate({baseline:{testsPassed:baseline.status==='passed'?1:0,testsFailed:baseline.status==='passed'?0:1},candidate:{testsPassed:baseline.status==='passed'?1:0,testsFailed:baseline.status==='passed'?0:1},scenario:baseline,evaluations:evaluationResults});
  run=withStatus(run,'reviewing',{stage:'reviewing'});run=withStatus(run,validation.state==='FAIL'?'fallback':'awaiting_approval',{stage:validation.state==='FAIL'?'fallback':'awaiting_approval',fallbackReason:validation.state==='FAIL'?'validation-failed':undefined});
  return{run,baseline,candidateResults,validation,workflow:{...workflow,commits:workflow.commits.map(commit=>loop.acceptedCandidateIds.includes(commit.candidateId)?commit:{...commit,status:'reverted'})}};
}
