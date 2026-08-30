import { describe, expect, it } from 'vitest';
import { routeModel } from './modelRouter';
import { aggregateModelBenchmarks } from './modelBenchmark';

describe('policy-aware model routing',()=>{
  it('selects a cheaper benchmarked model only when it meets the quality floor',()=>{
    const benchmarks=aggregateModelBenchmarks([{model:'google/gemini-2.5-flash',passed:true,inputTokens:10,outputTokens:2,latencyMs:50,cost:.01},{model:'google/gemini-2.5-flash',passed:true,inputTokens:10,outputTokens:2,latencyMs:50,cost:.01}]);
    expect(routeModel({currentModel:'openai/gpt-4.1',minimumAccuracy:1,requirements:{structuredOutput:true,tools:true}},benchmarks)).toMatchObject({selected:{model:'google/gemini-2.5-flash'},quality:'MEASURED'});
  });
  it('does not guess when measured alternatives fail the floor',()=>{
    const result=routeModel({currentModel:'openai/gpt-4.1',minimumAccuracy:1},aggregateModelBenchmarks([{model:'google/gemini-2.5-flash',passed:false,inputTokens:1,outputTokens:1,latencyMs:50,cost:.01}]));
    expect(result.selected).toBeUndefined();
    expect(result.quality).toBe('NOT_VERIFIED');
  });
});
