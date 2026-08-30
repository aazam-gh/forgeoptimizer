import { describe, expect, it } from 'vitest';
import { runFixtureBenchmark } from './benchmark';

describe('repeatable fixture benchmark',()=>{
  it('reports deterministic opportunity and budget metrics',()=>{
    const result=runFixtureBenchmark();
    expect(result).toMatchObject({fixture:'fixture://inefficient-ai-app',opportunitiesExpected:5,opportunitiesFound:5,highConfidenceCandidates:2,quality:'DETERMINISTIC_FIXTURE'});
    expect(result.estimatedOptimized.cost).toBeLessThan(result.baseline.cost);
  });
});
