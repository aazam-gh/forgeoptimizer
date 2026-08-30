export type Category = 'Deterministic replacement' | 'Duplicate calls' | 'Context reduction' | 'Cheaper model' | 'Parallelize';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type MetricQuality = 'MEASURED' | 'ESTIMATED' | 'INFERRED';
export interface AiUsage { id:string; file:string; line:number; functionName:string; provider:string; model?:string; purpose:string; inputTokens:number; outputTokens:number; quality:MetricQuality; }
export interface Candidate { id:string; usageId:string; file:string; line:number; category:Category; title:string; finding:string; recommendation:string; savingsPercent:number; confidence:Confidence; risk:'LOW'|'MEDIUM'|'HIGH'; removesAi:boolean; accepted?:boolean; diff:string; }
export interface RunMetrics { calls:number; tokens:number; cost:number; latencyMs:number; quality:MetricQuality; }
export interface AgentEvent { id:string; label:string; status:'queued'|'active'|'complete'|'blocked'; detail:string; }
export interface Run { id:string; repositoryUrl:string; status:'idle'|'analyzing'|'ready'|'optimizing'|'complete'|'failed'; createdAt:string; usages:AiUsage[]; candidates:Candidate[]; before:RunMetrics; after?:RunMetrics; events:AgentEvent[]; }
