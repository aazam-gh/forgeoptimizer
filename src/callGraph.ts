import type { AiUsage } from './domain';
import { estimateCost } from './pricing';

export type AIUsageGraphNode={id:string;label:string;file:string;provider:string;model?:string;calls:number;tokens:number;cost:number;flagged:boolean};
export type AIUsageGraphEdge={from:string;to:string;calls:number};
export type AIUsageGraph={nodes:AIUsageGraphNode[];edges:AIUsageGraphEdge[]};

export function buildAIUsageGraph(usages:AiUsage[],flaggedUsageIds:string[]=[]):AIUsageGraph{
  const flagged=new Set(flaggedUsageIds);
  const nodes=new Map<string,AIUsageGraphNode>();
  const edgeCounts=new Map<string,AIUsageGraphEdge>();
  let previous:string|undefined;
  for(const usage of usages){
    const id=`${usage.file}#${usage.functionName}`;
    const current=nodes.get(id);
    const cost=estimateCost(usage.model,usage.inputTokens,usage.outputTokens).value;
    if(current){current.calls+=1;current.tokens+=usage.inputTokens+usage.outputTokens;current.cost+=cost;current.flagged ||= flagged.has(usage.id);}
    else nodes.set(id,{id,label:usage.functionName,file:usage.file,provider:usage.provider,model:usage.model,calls:1,tokens:usage.inputTokens+usage.outputTokens,cost,flagged:flagged.has(usage.id)});
    if(previous&&previous!==id){const key=`${previous}->${id}`;const edge=edgeCounts.get(key);if(edge)edge.calls+=1;else edgeCounts.set(key,{from:previous,to:id,calls:1});}
    previous=id;
  }
  return{nodes:[...nodes.values()].map(node=>({...node,cost:Number(node.cost.toFixed(6))})),edges:[...edgeCounts.values()]};
}
