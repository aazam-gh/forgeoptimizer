import type { AgentEvent } from './domain';
export const trueForgeConfig={url:import.meta.env.VITE_TRUEFORGE_URL??'http://localhost:8790',model:import.meta.env.VITE_TRUEFORGE_MODEL??'openai/gpt-4.1-mini',enabled:false};
type TrueForgeSession={id:string;status?:string};
async function trueForgeFetch<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(`${trueForgeConfig.url.replace(/\/$/,'')}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',...init?.headers}});if(!response.ok)throw new Error(`TrueForge ${response.status}: ${await response.text()}`);return response.json() as Promise<T>;}
export async function getTrueForgeCapabilities(){return trueForgeFetch<Record<string,unknown>>('/capabilities');}
export async function runTrueForgeOrchestrator(repositoryUrl:string,onEvent:(event:AgentEvent)=>void){
 if(!trueForgeConfig.enabled)return{mode:'local-deterministic' as const};
 onEvent({id:'tf-root',label:'Optimization Orchestrator',status:'active',detail:`Session requested for ${repositoryUrl}`});
 const agent={spec:{model:{name:trueForgeConfig.model},instructions:'You are the ForgeOptimizer root orchestrator. Analyze repository evidence, never expose secrets or chain-of-thought, and request approval before external writes.',messages:[{type:'user.message',content:`Prepare an optimization analysis for ${repositoryUrl}. Return concise evidence and next actions.`}],config:{iteration_limit:20,dynamic_sub_agents:{enabled:true},context_management:{compaction:{enabled:true},large_tool_response:{enabled:true}}}}};
 const session=await trueForgeFetch<TrueForgeSession>('/sessions',{method:'POST',body:JSON.stringify({agent})});
 onEvent({id:'tf-root',label:'Optimization Orchestrator',status:'complete',detail:`TrueForge session ${session.id} created`});
 return{mode:'trueforge' as const,sessionId:session.id};
}
