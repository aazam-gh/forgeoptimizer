import type { EvaluationCase, EvaluationResult } from './domain';
import { evaluateCase } from './v2';

export type EvaluationExecutor=(input:unknown,test:EvaluationCase)=>Promise<unknown>|unknown;

export async function runEvaluationSuite(cases:EvaluationCase[],baselineExecutor:EvaluationExecutor,candidateExecutor:EvaluationExecutor):Promise<EvaluationResult[]>{
  return Promise.all(cases.map(async test=>{try{const [baseline,candidate]=await Promise.all([baselineExecutor(test.input,test),candidateExecutor(test.input,test)]);return evaluateCase(test,baseline,candidate);}catch(error){return{caseId:test.id,baseline:undefined,candidate:undefined,passed:false,confidence:'LOW' as const,reason:`Evaluation execution failed: ${error instanceof Error?error.message:'unknown error'}`};}}));
}

export function deduplicateEvaluationCases(cases:EvaluationCase[]):EvaluationCase[]{const seen=new Set<string>();return cases.filter(test=>{const key=JSON.stringify([test.input,test.expected,test.evaluator,test.tolerance]);if(seen.has(key))return false;seen.add(key);return true;});}
