import { describe, expect, it } from 'vitest';
import { analyzeContextBreakdown } from './contextAnalysis';

describe('prompt and context analysis',()=>{
  it('reports token shares and retrieval dominance',()=>{const result=analyzeContextBreakdown({systemTokens:100,conversationTokens:200,retrievedTokens:800,userTokens:100,potentialRemovableTokens:400});expect(result).toMatchObject({totalTokens:1200,retrievalDominates:true,potentialRemovableTokens:400,quality:'MEASURED'});expect(result.shares.retrieved).toBeCloseTo(2/3);});
  it('does not invent removable context when it was not measured',()=>expect(analyzeContextBreakdown({systemTokens:1,conversationTokens:1,retrievedTokens:1,userTokens:1})).toMatchObject({potentialRemovableTokens:0,quality:'NOT_VERIFIED'}));
});
