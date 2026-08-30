import { describe, expect, it } from 'vitest';
import { generateEvaluationCases } from './evaluationGeneration';

describe('evaluation case generation',()=>{
  it('preserves evidence provenance and deduplicates equivalent cases',()=>{const cases=generateEvaluationCases([{id:'test-1',name:'existing',input:'a',expected:'A',source:'existing_test'},{id:'fixture-1',name:'fixture',input:'a',expected:'A',source:'fixture'},{id:'generated-1',name:'generated',input:'b',expected:'B',source:'generated'}]);expect(cases).toHaveLength(2);expect(cases[0]).toMatchObject({source:'existing_test',evaluator:'exact'});expect(cases[1]).toMatchObject({source:'generated'});});
});
