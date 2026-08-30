import { describe, expect, it } from 'vitest';
import { findCheaperModels, getModelProfile } from './modelRegistry';

describe('central model registry',()=>{
  it('normalizes model lookup and exposes capability metadata',()=>{
    expect(getModelProfile(' OpenAI/GPT-4.1 ')).toMatchObject({provider:'OpenAI',structuredOutput:true,tools:true});
  });

  it('only recommends cheaper models with sufficient context',()=>{
    expect(findCheaperModels('openai/gpt-4.1').map(model=>model.id)).toEqual(['google/gemini-2.5-flash']);
    expect(findCheaperModels('unknown/model')).toEqual([]);
  });
});
