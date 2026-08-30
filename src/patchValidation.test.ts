import { describe, expect, it } from 'vitest';
import { validateCandidatePatch } from './patchValidation';

describe('candidate patch validation',()=>{
  it('extracts changed files and accepts a normal unified diff',()=>{
    expect(validateCandidatePatch('--- a/src/app.ts\n+++ b/src/app.ts\n@@\n-old\n+new')).toEqual({valid:true,changedFiles:['src/app.ts'],errors:[]});
  });

  it('rejects traversal and binary patches before sandbox application',()=>{
    const result=validateCandidatePatch('GIT binary patch\n+++ b/../secrets.env\n');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['binary patches are not supported','unsafe changed file path: ../secrets.env']));
  });
});
