export type GitHubRepository={owner:string;name:string;defaultBranch:string;private:boolean;baseCommitSha:string};
export type GitHubPullRequest={number:number;url:string;head:string;base:string;title:string};

function repositoryPath(repositoryUrl:string):{owner:string;name:string}{
  const url=new URL(repositoryUrl);
  if(url.hostname!=='github.com')throw new Error('Only github.com repository URLs are supported');
  const parts=url.pathname.split('/').filter(Boolean).map(part=>decodeURIComponent(part));
  if(parts.length!==2||!parts[0]||!parts[1])throw new Error('Repository URL must be https://github.com/{owner}/{repo}');
  return{owner:parts[0],name:parts[1].replace(/\.git$/,'')};
}

function token():string{const value=process.env.GITHUB_TOKEN??process.env.GH_TOKEN;if(!value)throw new Error('Server-side GITHUB_TOKEN is required for private repository access');return value;}

async function githubRequest<T>(path:string,init:RequestInit={}):Promise<T>{const response=await fetch(`https://api.github.com${path}`,{...init,headers:{Accept:'application/vnd.github+json','Content-Type':'application/json',Authorization:`Bearer ${token()}`,...init.headers}});if(!response.ok)throw new Error(`GitHub ${response.status}: ${await response.text()}`);return response.json() as Promise<T>;}

export async function inspectRepository(repositoryUrl:string,branch?:string):Promise<GitHubRepository>{const {owner,name}=repositoryPath(repositoryUrl);const repo=await githubRequest<{default_branch:string;private:boolean}>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);const selectedBranch=branch??repo.default_branch;const ref=await githubRequest<{object:{sha:string}}>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/ref/heads/${encodeURIComponent(selectedBranch)}`);return{owner,name,defaultBranch:selectedBranch,private:repo.private,baseCommitSha:ref.object.sha};}

export async function createOptimizationBranch(repositoryUrl:string,baseBranch:string,branchName:string):Promise<{repository:string;branchName:string;baseCommitSha:string}> {if(!/^forgeoptimizer\/run-[a-z0-9-]{4,80}$/.test(branchName))throw new Error('Optimization branch must use forgeoptimizer/run-{short-id}');const repository=await inspectRepository(repositoryUrl,baseBranch);await githubRequest(`/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/git/refs`,{method:'POST',body:JSON.stringify({ref:`refs/heads/${branchName}`,sha:repository.baseCommitSha})});return{repository:`${repository.owner}/${repository.name}`,branchName,baseCommitSha:repository.baseCommitSha};}

export async function createPullRequest(repositoryUrl:string,head:string,base:string,title:string,body:string):Promise<GitHubPullRequest>{const {owner,name}=repositoryPath(repositoryUrl);const result=await githubRequest<{number:number;html_url:string;head:{ref:string};base:{ref:string}}>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls`,{method:'POST',body:JSON.stringify({head,base,title,body})});return{number:result.number,url:result.html_url,head:result.head.ref,base:result.base.ref,title};}
