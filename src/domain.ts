export type Category = 'Deterministic replacement' | 'Duplicate calls' | 'Context reduction' | 'Cheaper model' | 'Parallelize';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type MetricQuality = 'MEASURED' | 'ESTIMATED' | 'INFERRED';
export interface AiUsage { id:string; file:string; line:number; functionName:string; provider:string; model?:string; purpose:string; inputTokens:number; outputTokens:number; quality:MetricQuality; }
export interface Candidate { id:string; usageId:string; file:string; line:number; category:Category; title:string; finding:string; recommendation:string; savingsPercent:number; confidence:Confidence; risk:'LOW'|'MEDIUM'|'HIGH'; removesAi:boolean; accepted?:boolean; dependsOn?:string[]; diff:string; }
export interface RunMetrics { calls:number; tokens:number; cost:number; latencyMs:number; quality:MetricQuality; }
export interface AgentEvent { id:string; label:string; status:'queued'|'active'|'complete'|'blocked'; detail:string; }
export interface Run { id:string; repositoryUrl:string; status:'idle'|'analyzing'|'ready'|'optimizing'|'complete'|'failed'; approvalStatus:'pending'|'approved'; createdAt:string; usages:AiUsage[]; candidates:Candidate[]; before:RunMetrics; after?:RunMetrics; events:AgentEvent[]; }

export type CaptureLevel = 'metadata_only' | 'redacted' | 'full_local_only';
export type EvaluatorType = 'exact' | 'json' | 'schema' | 'numeric_tolerance' | 'subset' | 'regex' | 'snapshot' | 'http_assertion';
export interface SourceLocation { file:string; line?:number; functionName?:string; }
export interface AIInvocation { id:string; provider:string; model?:string; callSite:SourceLocation; timestamp:string; inputTokens?:number; outputTokens?:number; latencyMs?:number; cost?:number; requestFingerprint?:string; cacheHit?:boolean; retryCount?:number; error?:boolean; contextTokens?:Record<string,number>; metadata:Record<string,unknown>; }
export interface OptimizationScenario { id:string; name:string; command:string; cwd:string; timeoutMs:number; expectedExitStatus:number; category:'test'|'integration'|'api'|'cli'|'workflow'; requiredEnv:string[]; }
export interface BaselineProfile { id:string; runId:string; commitSha:string; capturedAt:string; scenarioId:string; invocations:AIInvocation[]; testsPassed:number; testsFailed:number; tokens:number; cost:number; latencyMs:number; outputs:unknown[]; quality:'MEASURED'|'ESTIMATED'|'NOT_VERIFIED'; }
export interface EvaluationCase { id:string; name:string; input:unknown; expected:unknown; evaluator:EvaluatorType; tolerance?:number; source:'existing_test'|'fixture'|'generated'; }
export interface EvaluationResult { caseId:string; baseline:unknown; candidate:unknown; passed:boolean; confidence:'HIGH'|'MEDIUM'|'LOW'; reason:string; }
export interface OptimizationPlanStep { id:string; candidateId:string; title:string; dependsOn:string[]; score:number; status:'queued'|'running'|'passed'|'reverted'|'skipped'; }
export interface OptimizationPlan { id:string; runId:string; createdAt:string; steps:OptimizationPlanStep[]; expectedSavingsPercent:number; risk:'LOW'|'MEDIUM'|'HIGH'; }
export interface OptimizationPolicy { maxBehavioralRisk:'low'|'medium'|'high'; minimumExpectedSavingsPercent:number; allowModelChanges:boolean; allowPromptChanges:boolean; allowAiRemoval:boolean; maxFilesPerPatch:number; requireAllTests:boolean; requireReviewAgent:boolean; }
export interface CostProjection { measuredPerRun:number; requestsPerDay:number; dailySavings:number; monthlySavings:number; annualSavings:number; quality:'MEASURED'|'ESTIMATED'|'NOT_VERIFIED'; }
export interface GitBranchRecord { baseBranch:string; baseCommitSha:string; optimizationBranch:string; resultingCommitSha?:string; }
export interface PullRequestRecord { number?:number; url?:string; title:string; status:'not_created'|'awaiting_approval'|'created'|'merged'; branch:GitBranchRecord; }
