import type { Candidate, GitBranchRecord } from './domain';

export type OptimizationCommit={candidateId:string;commitSha:string;status:'applied'|'reverted';message:string};
export type RepositoryWorkflowState={branch:GitBranchRecord;commits:OptimizationCommit[];currentCommitSha:string};

export function createWorkflowState(branch:GitBranchRecord):RepositoryWorkflowState{return{branch,commits:[],currentCommitSha:branch.baseCommitSha};}

export function unappliedCandidates(state:RepositoryWorkflowState,candidates:Candidate[]):Candidate[]{const completed=new Set(state.commits.filter(commit=>commit.status==='applied').map(commit=>commit.candidateId));return candidates.filter(candidate=>!completed.has(candidate.id));}

export function recordOptimizationCommit(state:RepositoryWorkflowState,candidate:Candidate,commitSha:string):RepositoryWorkflowState{if(!/^[0-9a-f]{7,64}$/i.test(commitSha))throw new Error('Optimization commit SHA is invalid');if(state.commits.some(commit=>commit.candidateId===candidate.id&&commit.status==='applied'))return state;return{...state,currentCommitSha:commitSha,commits:[...state.commits,{candidateId:candidate.id,commitSha,status:'applied',message:`optimize: ${candidate.title}`}]};}

export function markOptimizationReverted(state:RepositoryWorkflowState,candidateId:string,reason:string):RepositoryWorkflowState{const index=state.commits.findIndex(commit=>commit.candidateId===candidateId&&commit.status==='applied');if(index<0)throw new Error(`No applied optimization found for ${candidateId}`);return{...state,commits:state.commits.map((commit,commitIndex)=>commitIndex===index?{...commit,status:'reverted',message:`${commit.message} (reverted: ${reason})`}:commit)};}

export function workflowReport(state:RepositoryWorkflowState){return{baseCommitSha:state.branch.baseCommitSha,optimizationBranch:state.branch.optimizationBranch,resultingCommitSha:state.currentCommitSha,appliedCandidates:state.commits.filter(commit=>commit.status==='applied').map(commit=>commit.candidateId),revertedCandidates:state.commits.filter(commit=>commit.status==='reverted').map(commit=>commit.candidateId)};}
