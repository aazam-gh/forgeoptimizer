import { describe, expect, it } from 'vitest';
import { analyzeBlastRadius } from './blastRadius';

describe('blast-radius analysis',()=>{
  it('marks exported shared-schema code with many dependents as high radius',()=>{
    const result=analyzeBlastRadius({callers:['a','b','c','d'],imports:['a','b','c','d','e'],exportedApi:true,dependentModules:['a','b','c','d'],associatedTests:['a'],sharedSchemas:true});
    expect(result.level).toBe('HIGH');
    expect(result.reasons).toEqual(expect.arrayContaining(['exported API','shared schema']));
  });
  it('keeps a single internal call site low radius',()=>{
    expect(analyzeBlastRadius({callers:['internal'],imports:[],exportedApi:false,dependentModules:[],associatedTests:['internal'],sharedSchemas:false})).toMatchObject({score:0,level:'LOW'});
  });
});
