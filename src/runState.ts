import type { Run, RunStatus } from './domain.ts';

const transitions:Record<RunStatus,RunStatus[]>={
  idle:['created'],created:['preparing','cancelled'],preparing:['analyzing','failed','cancelled'],analyzing:['baseline_running','planning','fallback','failed','cancelled'],baseline_running:['planning','fallback','failed','cancelled'],planning:['optimizing','failed','cancelled'],optimizing:['validating','fallback','failed','cancelled'],validating:['reviewing','fallback','failed','cancelled'],reviewing:['awaiting_approval','failed','cancelled'],awaiting_approval:['publishing','cancelled'],publishing:['completed','failed'],fallback:['completed','failed','cancelled'],ready:['planning','optimizing','cancelled'],complete:['awaiting_approval','completed'],completed:[],failed:[],cancelled:[]
};

export type RunTransitionMetadata={mode?:Run['mode'];stage?:string;failureReason?:string;fallbackReason?:string;activeCandidateId?:string;trueForgeSessionId?:string;trueForgeTurnId?:string;activeSandboxId?:string;retryCount?:number};

export function canTransition(from:RunStatus,to:RunStatus):boolean{return from===to||transitions[from]?.includes(to)===true;}

export function transitionRun(run:Run,to:RunStatus,metadata:RunTransitionMetadata={}):Run{if(!canTransition(run.status,to))throw new Error(`Invalid run transition: ${run.status} -> ${to}`);const now=new Date().toISOString();return{...run,...metadata,status:to,updatedAt:now,startedAt:run.startedAt??(to==='preparing'||to==='analyzing'||to==='baseline_running'?now:undefined),completedAt:to==='completed'||to==='failed'||to==='cancelled'?now:run.completedAt};}

export function initialRun(run:Pick<Run,'id'|'repositoryUrl'|'approvalStatus'|'createdAt'|'usages'|'candidates'|'before'|'events'>):Run{return{...run,status:'created',stage:'created',mode:'local-deterministic',retryCount:0,updatedAt:run.createdAt};}
