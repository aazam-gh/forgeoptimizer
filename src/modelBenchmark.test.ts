import { describe, expect, it } from 'vitest';
import { aggregateModelBenchmarks, calculateOptimizationRoi, selectBenchmarkWinner } from './modelBenchmark';

describe('measured model benchmark selection',()=>{
  it('aggregates accuracy, latency, tokens, and cost',()=>{const results=aggregateModelBenchmarks([{model:'model-a',passed:true,inputTokens:10,outputTokens:4,latencyMs:100,cost:.03},{model:'model-a',passed:false,inputTokens:12,outputTokens:6,latencyMs:200,cost:.02}]);expect(results[0]).toMatchObject({model:'model-a',accuracy:.5,averageInputTokens:11,averageLatencyMs:150,averageCost:.025,quality:'MEASURED'});});
  it('chooses the cheapest model that meets the quality floor',()=>{const results=aggregateModelBenchmarks([{model:'a',passed:true,inputTokens:1,outputTokens:1,latencyMs:100,cost:.03},{model:'b',passed:true,inputTokens:1,outputTokens:1,latencyMs:120,cost:.01},{model:'b',passed:false,inputTokens:1,outputTokens:1,latencyMs:120,cost:.01}]);expect(selectBenchmarkWinner(results,.99)?.model).toBe('a');expect(selectBenchmarkWinner(results,.5)?.model).toBe('b');});
  it('keeps optimizer cost separate from application savings',()=>expect(calculateOptimizationRoi(2,200)).toMatchObject({multiple:100,breakEvenMonths:.01}));
});
