import { describe, expect, it } from 'vitest';
import { buildAIUsageGraph } from './callGraph';
import type { AiUsage } from './domain';

const usage=(id:string,file:string,functionName:string):AiUsage=>({id,file,line:1,functionName,provider:'OpenAI',model:'gpt-4.1',purpose:'test',inputTokens:10,outputTokens:2,quality:'MEASURED'});

describe('runtime AI call graph',()=>{
  it('aggregates repeated call sites and sequential edges',()=>{
    const graph=buildAIUsageGraph([usage('a','src/a.ts','retrieve'),usage('b','src/b.ts','classify'),usage('c','src/b.ts','classify'),usage('d','src/a.ts','retrieve')],['b']);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.find(node=>node.label==='classify')).toMatchObject({calls:2,flagged:true,tokens:24});
    expect(graph.edges).toEqual(expect.arrayContaining([{from:'src/a.ts#retrieve',to:'src/b.ts#classify',calls:1},{from:'src/b.ts#classify',to:'src/a.ts#retrieve',calls:1}]));
  });
});
