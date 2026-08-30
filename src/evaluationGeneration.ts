import type { EvaluationCase, EvaluatorType } from './domain';
import { deduplicateEvaluationCases } from './evaluations';

export type EvaluationEvidence={id:string;name:string;input:unknown;expected:unknown;evaluator?:EvaluatorType;tolerance?:number;source:'existing_test'|'fixture'|'generated'};

export function generateEvaluationCases(evidence:EvaluationEvidence[]):EvaluationCase[]{const cases=evidence.map(item=>({id:item.id,name:item.name,input:item.input,expected:item.expected,evaluator:item.evaluator??'exact',tolerance:item.tolerance,source:item.source}));return deduplicateEvaluationCases(cases);}
