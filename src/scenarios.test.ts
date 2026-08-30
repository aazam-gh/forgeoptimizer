import { describe, expect, it } from 'vitest';
import { defaultScenarios, executeScenario, validateScenario, validateScenarios } from './scenarios';

describe('sandbox-backed optimization scenarios',()=>{
  it('ships valid fixture scenarios and validates unsafe paths',()=>{expect(validateScenarios([...defaultScenarios])).toEqual([]);expect(validateScenario({...defaultScenarios[0],cwd:'../outside'})).toContain('scenario cwd must remain inside the sandbox repository');});
  it('rejects invalid and duplicate scenarios before execution',()=>{expect(validateScenarios([{...defaultScenarios[0],id:'same',command:''},{...defaultScenarios[1],id:'same'}])).toEqual(expect.arrayContaining(['same: scenario command is required','same: duplicate scenario id']));});
  it('returns explicit not-verified results for invalid scenarios',async()=>{const result=await executeScenario({execute:async()=>({scenarioId:'never',status:'passed',quality:'MEASURED'})},{repositoryUrl:'fixture://app',commitSha:'abc',scenario:{...defaultScenarios[0],cwd:'/host'}});expect(result.status).toBe('not_verified');});
});
