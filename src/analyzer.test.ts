import { describe, expect, it } from 'vitest';
import { analyzeFixture } from './analyzer';

describe('fixture candidate generation',()=>{
  it('derives model-change recommendations from the central registry',()=>{
    const candidate=analyzeFixture().candidates.find(item=>item.id==='c5');
    expect(candidate).toMatchObject({changeType:'model',recommendedModel:'google/gemini-2.5-flash',requiresBenchmark:true});
    expect(candidate?.recommendation).toContain('benchmark');
  });
});
