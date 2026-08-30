export interface ModelPrice { provider:string; model:string; inputPerMillion:number; outputPerMillion:number; }
export const modelPricing:ModelPrice[]=[
 {provider:'OpenAI',model:'gpt-4.1',inputPerMillion:2,outputPerMillion:8},
 {provider:'OpenAI',model:'gpt-4.1-mini',inputPerMillion:.4,outputPerMillion:1.6},
 {provider:'Anthropic',model:'claude-3-5-sonnet',inputPerMillion:3,outputPerMillion:15},
 {provider:'Google',model:'gemini-2.5-flash',inputPerMillion:.3,outputPerMillion:2.5}
];
export function estimateCost(model:string|undefined,inputTokens:number,outputTokens:number){const p=modelPricing.find(x=>x.model===model);if(!p)return{value:0,quality:'INFERRED' as const};return{value:inputTokens/1e6*p.inputPerMillion+outputTokens/1e6*p.outputPerMillion,quality:'ESTIMATED' as const};}
