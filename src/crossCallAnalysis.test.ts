import { describe, expect, it } from 'vitest';
import { analyzeCrossCallUsage } from './crossCallAnalysis';

const invocation=(id:string,metadata:Record<string,unknown>={},requestFingerprint='fp:one')=>({id,provider:'OpenAI',callSite:{file:`src/${id}.ts`,line:1},timestamp:'2026-01-01T00:00:00.000Z',captureLevel:'metadata_only' as const,requestFingerprint,metadata});

describe('cross-call analysis',()=>{
  it('finds duplicate semantic requests and repeated context',()=>{
    const findings=analyzeCrossCallUsage([invocation('a',{contextFingerprint:'ctx-1'}),invocation('b',{contextFingerprint:'ctx-1'})]);
    expect(findings.map(finding=>finding.kind)).toEqual(expect.arrayContaining(['duplicate_semantic_request','repeated_context']));
  });

  it('flags context-heavy invocations without claiming measured savings',()=>{
    const findings=analyzeCrossCallUsage([invocation('a',{inputTokens:1000,retrievedTokens:800},'fp:a')]);
    expect(findings).toContainEqual(expect.objectContaining({kind:'context_dominates_cost',confidence:'MEDIUM'}));
  });
});
