import { describe, expect, it } from 'vitest';
import { normalizePatchPayload } from './patchPayload';

describe('structured TrueForge patch payloads',()=>{
  it('normalizes safe file contents without accepting traversal',()=>{
    expect(normalizePatchPayload([{path:'src/app.ts',content:'export const ok=true;'}])).toEqual({files:[{path:'src/app.ts',content:'export const ok=true;'}],errors:[]});
    expect(normalizePatchPayload([{path:'../secrets.env',content:'no'}]).errors).toContain('Unsafe patch file path: ../secrets.env');
  });
  it('rejects duplicates and malformed entries',()=>{
    const result=normalizePatchPayload([{path:'src/app.ts',content:'a'},{path:'src/app.ts',content:'b'},null]);
    expect(result.files).toHaveLength(1);expect(result.errors).toEqual(expect.arrayContaining(['Duplicate patch file: src/app.ts','Patch file entries must be objects']));
  });
});
