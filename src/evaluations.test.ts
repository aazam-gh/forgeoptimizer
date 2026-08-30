import { describe, expect, it } from 'vitest';
import { deduplicateEvaluationCases, runEvaluationSuite } from './evaluations';
import type { EvaluationCase } from './domain';

const testCase:EvaluationCase={id:'case-1',name:'stable response',input:{kind:'billing'},expected:{label:'billing',extra:true},evaluator:'exact',source:'existing_test'};

describe('baseline-aware evaluation suite',()=>{
  it('executes baseline and candidate and rejects a candidate that differs from baseline',async()=>{
    const [result]=await runEvaluationSuite([testCase],async()=>({label:'billing'}),async()=>({label:'billing',extra:true}));
    expect(result).toMatchObject({passed:false,reason:'Candidate differs from the exact baseline result'});
  });

  it('deduplicates equivalent generated cases without changing source evidence',()=>{
    expect(deduplicateEvaluationCases([testCase,{...testCase,id:'case-duplicate',source:'generated'}])).toHaveLength(1);
  });
});
