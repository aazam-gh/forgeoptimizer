import type { ScenarioExecutionResult } from './domain';
import { executeScenario, type SandboxExecutionRequest, type SandboxExecutor } from './scenarios';
import { runTrueForgeOrchestrator } from './trueforge';

type RemoteScenarioResult={scenarioId?:unknown;status?:unknown;exitStatus?:unknown;stdout?:unknown;stderr?:unknown;durationMs?:unknown;quality?:unknown};

function normalizeResult(value:RemoteScenarioResult,expectedScenarioId:string,expectedExitStatus:number):ScenarioExecutionResult|undefined {
  if(value.scenarioId!==expectedScenarioId||!['passed','failed','timed_out','not_verified'].includes(String(value.status)))return undefined;
  const quality=value.quality==='MEASURED'?'MEASURED':'NOT_VERIFIED';
  const exitStatus=typeof value.exitStatus==='number'?value.exitStatus:undefined;
  const status=value.status==='passed'&&exitStatus!==expectedExitStatus?'failed':value.status as ScenarioExecutionResult['status'];
  return {scenarioId:expectedScenarioId,status,exitStatus,stdout:typeof value.stdout==='string'?value.stdout:undefined,stderr:status==='failed'&&value.status==='passed'?`Expected exit status ${expectedExitStatus}, received ${exitStatus??'none'}`:typeof value.stderr==='string'?value.stderr:undefined,durationMs:typeof value.durationMs==='number'?value.durationMs:undefined,quality};
}

export const trueForgeSandboxExecutor:SandboxExecutor={
  async execute(request:SandboxExecutionRequest):Promise<ScenarioExecutionResult>{
    const task=`Inside the isolated TrueForge sandbox, checkout repository ${request.repositoryUrl} at exact commit ${request.commitSha}. Run only this scenario command from repository directory ${request.scenario.cwd}: ${request.scenario.command}. Do not execute on the host. Required environment names are: ${request.scenario.requiredEnv.join(', ')||'none'}. Return only JSON with scenarioId, status (passed, failed, timed_out, or not_verified), exitStatus, stdout, stderr, durationMs, and quality (MEASURED or NOT_VERIFIED). The expected exit status is ${request.scenario.expectedExitStatus}.`;
    const result=await runTrueForgeOrchestrator(request.repositoryUrl,()=>undefined,{task});
    if(result.mode!=='trueforge')return{scenarioId:request.scenario.id,status:'not_verified',quality:'NOT_VERIFIED',stderr:result.failureReason??'TrueForge sandbox unavailable'};
    const normalized=normalizeResult(result.finalResult,request.scenario.id,request.scenario.expectedExitStatus);
    return normalized??{scenarioId:request.scenario.id,status:'not_verified',quality:'NOT_VERIFIED',stderr:'TrueForge returned no validated scenario result'};
  },
};

export async function executeTrueForgeScenario(request:SandboxExecutionRequest):Promise<ScenarioExecutionResult>{return executeScenario(trueForgeSandboxExecutor,request);}
