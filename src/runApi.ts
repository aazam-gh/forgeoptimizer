import type { Run, RunStatus } from './domain';

type PersistedRun=Pick<Run,'id'|'repositoryUrl'|'status'|'mode'|'approvalStatus'|'createdAt'|'updatedAt'|'failureReason'|'fallbackReason'|'trueForgeSessionId'|'trueForgeTurnId'|'events'|'candidates'|'usages'|'before'|'baseline'|'evaluations'|'plan'|'branch'|'pullRequest'> & {policy?:unknown};

async function request<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(path,{...init,headers:{'Content-Type':'application/json',...init?.headers}});if(!response.ok)throw new Error(`Run API ${response.status}: ${await response.text()}`);return response.json() as Promise<T>;}
export function createPersistedRun(input:Pick<Run,'repositoryUrl'|'candidates'|'usages'|'before'|'approvalStatus'> & {policy?:unknown}):Promise<PersistedRun>{return request<PersistedRun>('/api/runs',{method:'POST',body:JSON.stringify(input)});}
export function listPersistedRuns():Promise<PersistedRun[]>{return request<PersistedRun[]>('/api/runs');}
export function getPersistedRun(id:string):Promise<PersistedRun>{return request<PersistedRun>(`/api/runs/${encodeURIComponent(id)}`);}
export function submitPersistedPlan(id:string,plan:Run['plan']):Promise<PersistedRun>{return request<PersistedRun>(`/api/runs/${encodeURIComponent(id)}/plan`,{method:'POST',body:JSON.stringify(plan)});}
export function createPersistedBranch(id:string,input:{repositoryUrl:string;baseBranch:string;branchName:string}):Promise<PersistedRun>{return request<PersistedRun>(`/api/runs/${encodeURIComponent(id)}/github-branch`,{method:'POST',body:JSON.stringify(input)});}
export function createPersistedPullRequest(id:string,input:{repositoryUrl:string;head:string;base:string;title:string;body:string;approved:true}):Promise<PersistedRun>{return request<PersistedRun>(`/api/runs/${encodeURIComponent(id)}/github-pr`,{method:'POST',body:JSON.stringify(input)});}
export function transitionPersistedRun(id:string,transition:'start'|'cancel'):Promise<PersistedRun>{return request<PersistedRun>(`/api/runs/${encodeURIComponent(id)}/${transition}`,{method:'POST'});}
export function approvePersistedRun(id:string):Promise<PersistedRun>{return request<PersistedRun>(`/api/runs/${encodeURIComponent(id)}/approve`,{method:'POST'});}
export function appendPersistedEvent(id:string,event:Run['events'][number]):Promise<PersistedRun>{return request<PersistedRun>(`/api/runs/${encodeURIComponent(id)}/events`,{method:'POST',body:JSON.stringify(event)});}
export function subscribeToRunEvents(id:string,onEvent:(event:Run['events'][number])=>void):()=>void{const source=new EventSource(`/api/runs/${encodeURIComponent(id)}/events`);source.addEventListener('agent',event=>{try{onEvent(JSON.parse((event as MessageEvent).data));}catch{onEvent({id:'api-error',label:'Run API',status:'blocked',detail:'Malformed persisted event ignored'});}});source.onerror=()=>source.close();return()=>source.close();}
export type { PersistedRun, RunStatus };
