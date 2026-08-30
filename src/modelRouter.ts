import type { ModelBenchmarkResult } from './modelBenchmark';
import { selectBenchmarkWinner } from './modelBenchmark';
import { getModelProfile, type ModelProfile } from './modelRegistry';

export type ModelRoutingRequest={currentModel:string;minimumAccuracy:number;requirements?:{structuredOutput?:boolean;tools?:boolean;multimodal?:boolean;reasoningTier?:ModelProfile['reasoningTier'];maxLatency?:ModelProfile['latencyClass']}};
export type ModelRoutingDecision={selected?:ModelBenchmarkResult;reason:string;quality:'MEASURED'|'NOT_VERIFIED'};

export function routeModel(request:ModelRoutingRequest,benchmarks:ModelBenchmarkResult[]):ModelRoutingDecision{
  const current=getModelProfile(request.currentModel);
  if(!current)return{reason:`Unknown current model: ${request.currentModel}`,quality:'NOT_VERIFIED'};
  const requirements=request.requirements??{};
  const supported=(result:ModelBenchmarkResult)=>{const profile=getModelProfile(result.model);if(!profile)return false;return (requirements.structuredOutput===undefined||profile.structuredOutput===requirements.structuredOutput)&&(requirements.tools===undefined||profile.tools===requirements.tools)&&(requirements.multimodal===undefined||profile.multimodal===requirements.multimodal)&&(requirements.reasoningTier===undefined||profile.reasoningTier===requirements.reasoningTier)&&(requirements.maxLatency===undefined||['low','medium','high'].indexOf(profile.latencyClass)<=['low','medium','high'].indexOf(requirements.maxLatency));};
  const candidates=benchmarks.filter(result=>result.model.toLowerCase()!==current.id.toLowerCase()&&supported(result)&&result.averageCost<Number.MAX_VALUE);
  const winner=selectBenchmarkWinner(candidates,request.minimumAccuracy);
  return winner?{selected:winner,reason:`${winner.model} meets the ${request.minimumAccuracy} accuracy floor at lower measured cost`,quality:'MEASURED'}:{reason:'No benchmarked alternative meets the capability and accuracy requirements',quality:'NOT_VERIFIED'};
}
