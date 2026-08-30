import { describe, expect, it } from 'vitest';
import { buildOptimizationReport } from './report';

describe('optimization report builder',()=>{
  it('includes measured boundaries, validation state, and exact Git base',()=>{const report=buildOptimizationReport({before:{calls:4,tokens:100,cost:.04,latencyMs:100,quality:'MEASURED'},after:{calls:2,tokens:50,cost:.02,latencyMs:80,quality:'ESTIMATED'},candidates:[],branch:{baseBranch:'main',baseCommitSha:'a'.repeat(40),optimizationBranch:'forgeoptimizer/run-abcd'},validation:{state:'NOT_VERIFIED',canPublish:false,checks:{scenario:'NOT_VERIFIED'},reasons:['missing']},changedFiles:['src/app.ts']});expect(report).toContain('Estimated savings: 50.0%');expect(report).toContain('scenario: NOT_VERIFIED');expect(report).toContain(`Base: main @ ${'a'.repeat(40)}`);expect(report).toContain('src/app.ts');});
});
