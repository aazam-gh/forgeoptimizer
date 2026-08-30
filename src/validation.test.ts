import { describe, expect, it } from 'vitest';
import { approveValidationGate, assessValidationGate } from './validation';

const passing={baseline:{testsPassed:10,testsFailed:0},candidate:{testsPassed:10,testsFailed:0},scenario:{scenarioId:'tests',status:'passed' as const,quality:'MEASURED' as const},evaluations:[{caseId:'case-1',baseline:'ok',candidate:'ok',passed:true,confidence:'HIGH' as const,reason:'matched'}],typecheck:true,build:true,reviewApproved:true};

describe('full validation gate',()=>{
  it('publishes only when every required check is verified',()=>expect(assessValidationGate(passing)).toMatchObject({state:'PASS',canPublish:true}));
  it('preserves equal baseline failures but blocks regressions',()=>expect(assessValidationGate({...passing,baseline:{testsPassed:9,testsFailed:1},candidate:{testsPassed:9,testsFailed:1}})).toMatchObject({state:'PASS',canPublish:true}));
  it('reports missing evidence as NOT_VERIFIED',()=>expect(assessValidationGate({...passing,build:undefined})).toMatchObject({state:'NOT_VERIFIED',canPublish:false}));
  it('blocks a candidate with additional failures',()=>expect(assessValidationGate({...passing,baseline:{testsPassed:10,testsFailed:1},candidate:{testsPassed:9,testsFailed:2}})).toMatchObject({state:'FAIL',canPublish:false}));
  it('fails when the measured candidate scenario fails',()=>expect(assessValidationGate({...passing,scenario:{scenarioId:'tests',status:'failed',quality:'MEASURED'}})).toMatchObject({state:'FAIL',canPublish:false,reasons:expect.arrayContaining(['Candidate scenario failed or timed out'])}));
  it('allows human approval only after every non-review check is verified',()=>{const pending=assessValidationGate(passing);expect(approveValidationGate(pending)).toMatchObject({state:'PASS',canPublish:true,checks:{review:'PASS'}});expect(approveValidationGate(assessValidationGate({...passing,build:undefined}))).toMatchObject({state:'NOT_VERIFIED',canPublish:false});});
});
