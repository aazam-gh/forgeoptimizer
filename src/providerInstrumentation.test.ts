import { describe, expect, it, vi } from 'vitest';
import { instrumentAnthropic, instrumentGemini, instrumentOpenAI } from './providerInstrumentation';

const input={model:'gpt-4.1',callSite:{file:'src/provider.ts',line:4},captureLevel:'metadata_only' as const};
describe('normalized provider instrumentation',()=>{
  it('normalizes OpenAI usage and finish metadata',async()=>{const result=await instrumentOpenAI(input,async()=>({usage:{prompt_tokens:12,completion_tokens:4},finish_reason:'stop'}));expect(result.invocation.inputTokens).toBe(12);expect(result.invocation.outputTokens).toBe(4);expect(result.invocation.metadata).toMatchObject({provider:'OpenAI',finishReason:'stop'});});
  it('supports Anthropic and Gemini response shapes',async()=>{const anthropic=await instrumentAnthropic({...input,model:'claude-sonnet'},async()=>({usage:{input_tokens:8,output_tokens:3},stop_reason:'end_turn'}));const gemini=await instrumentGemini({...input,model:'gemini-2.5-flash'},async()=>({usage:{inputTokens:5,outputTokens:2}}));expect(anthropic.invocation.inputTokens).toBe(8);expect(gemini.invocation.outputTokens).toBe(2);});
  it('keeps the provider operation independent of metadata capture',async()=>{const operation=vi.fn().mockResolvedValue({usage:{prompt_tokens:1,completion_tokens:1}});await instrumentOpenAI({...input,metadata:{authorization:'Bearer sk-test_123456789012'}},operation);expect(operation).toHaveBeenCalledOnce();});
});
