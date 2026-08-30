import type { AgentEvent } from './domain';
export const trueForgeConfig={url:import.meta.env.VITE_TRUEFORGE_URL??'http://localhost:8000',enabled:Boolean(import.meta.env.VITE_TRUEFORGE_API_KEY)};
export async function runTrueForgeOrchestrator(repositoryUrl:string,onEvent:(event:AgentEvent)=>void){
 if(!trueForgeConfig.enabled)return{mode:'local-deterministic' as const};
 onEvent({id:'tf-root',label:'Optimization Orchestrator',status:'active',detail:`Session requested for ${repositoryUrl}`});
 return{mode:'trueforge' as const};
}
