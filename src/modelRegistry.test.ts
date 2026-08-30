import { describe, expect, it } from 'vitest';
import { findCheaperModels, getModelProfile, recommendModel } from './modelRegistry';

describe('central model registry',()=>{
  it('normalizes model lookup and exposes capability metadata',()=>{
    expect(getModelProfile(' OpenAI/GPT-4.1 ')).toMatchObject({provider:'OpenAI',structuredOutput:true,tools:true});
  });

  it('only recommends cheaper models with sufficient context',()=>{
    expect(findCheaperModels('openai/gpt-4.1').map(model=>model.id)).toEqual(['google/gemini-2.5-flash']);
    expect(findCheaperModels('unknown/model')).toEqual([]);
  });

  it('recommends a cheaper model only when required capabilities remain',()=>{
    expect(recommendModel('openai/gpt-4.1',{structuredOutput:true,tools:true})?.id).toBe('google/gemini-2.5-flash');
  });
});
