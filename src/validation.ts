import type { EvaluationResult, ScenarioExecutionResult } from './domain.ts';

export type ValidationState='PASS'|'FAIL'|'NOT_VERIFIED';
export type ValidationGateInput={baseline:{testsPassed:number;testsFailed:number};candidate:{testsPassed:number;testsFailed:number};scenario?:ScenarioExecutionResult;evaluations?:EvaluationResult[];typecheck?:boolean;build?:boolean;reviewApproved?:boolean};
export type ValidationGateResult={state:ValidationState;canPublish:boolean;checks:Record<string,ValidationState>;reasons:string[]};

export function assessValidationGate(input:ValidationGateInput):ValidationGateResult{
  const checks:Record<string,ValidationState>={};
  const reasons:string[]=[];
  checks.baseline='PASS';
  if(input.baseline.testsFailed>0)reasons.push('Baseline has documented failures');
  checks.regression=input.candidate.testsFailed<=input.baseline.testsFailed&&input.candidate.testsPassed>=input.baseline.testsPassed?'PASS':'FAIL';
  if(checks.regression==='FAIL')reasons.push('Candidate regressed compared with the exact baseline');
  checks.scenario=input.scenario?.quality==='MEASURED'&&input.scenario.status==='passed'?'PASS':input.scenario?.status==='failed'||input.scenario?.status==='timed_out'?'FAIL':'NOT_VERIFIED';
  if(checks.scenario==='FAIL')reasons.push('Candidate scenario failed or timed out');
  else if(checks.scenario!=='PASS')reasons.push('Scenario execution is not measured and passing');
  checks.evaluations=input.evaluations&&input.evaluations.length>0?(input.evaluations.every(result=>result.passed)?'PASS':'FAIL'):'NOT_VERIFIED';
  if(checks.evaluations!=='PASS')reasons.push('Behavioral evaluation evidence is incomplete or failing');
  checks.typecheck=input.typecheck===undefined?'NOT_VERIFIED':input.typecheck?'PASS':'FAIL';
  checks.build=input.build===undefined?'NOT_VERIFIED':input.build?'PASS':'FAIL';
  checks.review=input.reviewApproved===undefined?'NOT_VERIFIED':input.reviewApproved?'PASS':'FAIL';
  const failed=Object.values(checks).includes('FAIL');
  const missing=Object.values(checks).includes('NOT_VERIFIED');
  return{state:failed?'FAIL':missing?'NOT_VERIFIED':'PASS',canPublish:!failed&&!missing,reasons,checks};
}
