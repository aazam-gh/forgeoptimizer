import { analyzeFixture } from './analyzer';
import { defaultOptimizationBudget } from './budget';
import type { RunMetrics } from './domain';

export type FixtureBenchmark={fixture:string;opportunitiesExpected:number;opportunitiesFound:number;falsePositiveCandidates:number;highConfidenceCandidates:number;baseline:RunMetrics;estimatedOptimized:RunMetrics;optimizerBudget:{maxAgentCost:number;maxCandidates:number;maxRuntimeMs:number};quality:'DETERMINISTIC_FIXTURE'};

export function runFixtureBenchmark():FixtureBenchmark{
  const result=analyzeFixture();
  const proposed=result.candidates.filter(candidate=>candidate.confidence!=='LOW');
  const highConfidence=result.candidates.filter(candidate=>candidate.confidence==='HIGH');
  const estimatedOptimized={calls:Math.max(1,result.before.calls-highConfidence.length),tokens:Math.round(result.before.tokens*.32),cost:result.before.cost*.18,latencyMs:Math.round(result.before.latencyMs*.72),quality:'ESTIMATED' as const};
  return{fixture:'fixture://inefficient-ai-app',opportunitiesExpected:5,opportunitiesFound:result.candidates.length,falsePositiveCandidates:result.candidates.length-proposed.length,highConfidenceCandidates:highConfidence.length,baseline:result.before,estimatedOptimized,optimizerBudget:{maxAgentCost:defaultOptimizationBudget.maxAgentCost,maxCandidates:defaultOptimizationBudget.maxCandidates,maxRuntimeMs:defaultOptimizationBudget.maxRuntimeMs},quality:'DETERMINISTIC_FIXTURE'};
}
