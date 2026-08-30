import { describe, expect, it } from 'vitest';
import { initialRun, transitionRun } from './runState';

const run=()=>initialRun({id:'run-1',repositoryUrl:'fixture://app',approvalStatus:'pending',createdAt:'2026-01-01T00:00:00.000Z',usages:[],candidates:[],before:{calls:0,tokens:0,cost:0,latencyMs:0,quality:'MEASURED'},events:[]});

describe('run lifecycle state machine',()=>{
  it('accepts the ordered lifecycle and persists stage metadata',()=>{
    let current=run();
    for(const status of ['preparing','analyzing','baseline_running','planning','optimizing','validating','reviewing','awaiting_approval'] as const)current=transitionRun(current,status,{stage:status});
    expect(current.status).toBe('awaiting_approval');
    expect(current.stage).toBe('awaiting_approval');
    expect(current.startedAt).toBeDefined();
  });

  it('rejects skipped lifecycle transitions and records terminal errors',()=>{
    expect(()=>transitionRun(run(),'completed')).toThrow('Invalid run transition');
    const failed=transitionRun(transitionRun(run(),'preparing'),'failed',{failureReason:'TrueForge unavailable'});
    expect(failed.failureReason).toBe('TrueForge unavailable');
    expect(failed.completedAt).toBeDefined();
  });
});
