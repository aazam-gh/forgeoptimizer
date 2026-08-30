import type { OptimizationScenario, ScenarioExecutionResult } from './domain';

export type SandboxExecutionRequest={scenario:OptimizationScenario;commitSha:string;repositoryUrl:string};
export type SandboxExecutor={execute(request:SandboxExecutionRequest):Promise<ScenarioExecutionResult>};

export const defaultScenarios:readonly OptimizationScenario[]=[
  {id:'fixture-tests',name:'Fixture regression tests',command:'pnpm test',cwd:'.',timeoutMs:120000,expectedExitStatus:0,category:'test',requiredEnv:[]},
  {id:'fixture-typecheck',name:'Fixture typecheck',command:'pnpm typecheck',cwd:'.',timeoutMs:120000,expectedExitStatus:0,category:'test',requiredEnv:[]},
];

export function validateScenario(scenario:OptimizationScenario):string[]{const errors:string[]=[];if(!scenario.id.trim())errors.push('scenario id is required');if(!scenario.name.trim())errors.push('scenario name is required');if(!scenario.command.trim())errors.push('scenario command is required');if(!scenario.cwd||scenario.cwd.startsWith('/')||scenario.cwd.split('/').includes('..'))errors.push('scenario cwd must remain inside the sandbox repository');if(!Number.isInteger(scenario.timeoutMs)||scenario.timeoutMs<1000||scenario.timeoutMs>60*60*1000)errors.push('scenario timeout must be between 1 second and 1 hour');if(!Number.isInteger(scenario.expectedExitStatus))errors.push('expected exit status must be an integer');if(scenario.requiredEnv.some(name=>!/^[A-Z_][A-Z0-9_]*$/.test(name)))errors.push('required environment names must be uppercase identifiers');return errors;}
export function validateScenarios(scenarios:OptimizationScenario[]):string[]{const errors=scenarios.flatMap(scenario=>validateScenario(scenario).map(error=>`${scenario.id}: ${error}`));const ids=new Set<string>();for(const scenario of scenarios){if(ids.has(scenario.id))errors.push(`${scenario.id}: duplicate scenario id`);ids.add(scenario.id);}return errors;}
export async function executeScenario(executor:SandboxExecutor,request:SandboxExecutionRequest):Promise<ScenarioExecutionResult>{const errors=validateScenario(request.scenario);if(errors.length)return{scenarioId:request.scenario.id,status:'not_verified',quality:'NOT_VERIFIED',stderr:errors.join('; ')};return executor.execute(request);}
