import { describe, expect, it } from 'vitest';
import { resolveOptimizationSettings, validateSettings } from './config';

describe('project optimization settings',()=>{
  it('merges explicit policy, budget, traffic, and target settings',()=>{const settings=resolveOptimizationSettings({requestsPerDay:10000,targetReductionPercent:30,policy:{allowModelChanges:false},budget:{maxAgentCost:2}});expect(settings).toMatchObject({requestsPerDay:10000,targetReductionPercent:30,policy:{allowModelChanges:false},budget:{maxAgentCost:2}});});
  it('rejects unsafe negative or out-of-range targets',()=>{expect(validateSettings({...resolveOptimizationSettings(),requestsPerDay:-1})).toContain('requestsPerDay must be a non-negative number');expect(()=>resolveOptimizationSettings({targetReductionPercent:101})).toThrow('targetReductionPercent');});
});
