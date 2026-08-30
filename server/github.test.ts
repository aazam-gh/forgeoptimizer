import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitOptimizationChanges, createOptimizationBranch, createPullRequest, inspectCommit, inspectRepository, listRepositoryBranches } from './github';

describe('server-side GitHub workflow',()=>{
  afterEach(()=>{vi.unstubAllGlobals();delete process.env.GITHUB_TOKEN;});

  it('inspects a private repository without exposing the token',async()=>{
    process.env.GITHUB_TOKEN='server-secret';
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({default_branch:'main',private:true})).mockResolvedValueOnce(Response.json({object:{sha:'abc123'}}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(inspectRepository('https://github.com/acme/private-app')).resolves.toMatchObject({owner:'acme',name:'private-app',private:true,baseCommitSha:'abc123'});
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer server-secret');
  });

  it('creates only the constrained optimization branch name',async()=>{
    process.env.GITHUB_TOKEN='server-secret';
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({default_branch:'main',private:false})).mockResolvedValueOnce(Response.json({object:{sha:'abc123'}})).mockResolvedValueOnce(Response.json({})));
    await expect(createOptimizationBranch('https://github.com/acme/app','main','forgeoptimizer/run-abcd')).resolves.toMatchObject({branchName:'forgeoptimizer/run-abcd',baseCommitSha:'abc123'});
    await expect(createOptimizationBranch('https://github.com/acme/app','main','main')).rejects.toThrow('Optimization branch');
  });

  it('creates the optimization branch from the selected exact commit',async()=>{
    process.env.GITHUB_TOKEN='server-secret';
    const selected='c'.repeat(40);
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({default_branch:'main',private:false})).mockResolvedValueOnce(Response.json({object:{sha:'tip'.repeat(10)}})).mockResolvedValueOnce(Response.json({sha:selected})).mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(createOptimizationBranch('https://github.com/acme/app','main','forgeoptimizer/run-abcd',selected)).resolves.toMatchObject({baseCommitSha:selected});
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toMatchObject({sha:selected});
  });

  it('creates a pull request only through the explicit adapter call',async()=>{
    process.env.GITHUB_TOKEN='server-secret';
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({number:4,html_url:'https://github.com/acme/app/pull/4',head:{ref:'forgeoptimizer/run-abcd'},base:{ref:'main'}}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(createPullRequest('https://github.com/acme/app','forgeoptimizer/run-abcd','main','ForgeOptimizer report','summary')).resolves.toMatchObject({number:4,url:'https://github.com/acme/app/pull/4'});
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({head:'forgeoptimizer/run-abcd',base:'main'});
  });

  it('commits reviewed files through a constrained optimization branch',async()=>{
    process.env.GITHUB_TOKEN='server-secret';
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(Response.json({object:{sha:'a'.repeat(40)}}))
      .mockResolvedValueOnce(Response.json({tree:{sha:'tree-base'}}))
      .mockResolvedValueOnce(Response.json({sha:'tree-next'}))
      .mockResolvedValueOnce(Response.json({sha:'b'.repeat(40)}))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(commitOptimizationChanges('https://github.com/acme/app','forgeoptimizer/run-abcd',[{path:'src/app.ts',content:'export const ok = true;'}],'optimize: apply app patch')).resolves.toMatchObject({commitSha:'b'.repeat(40),changedFiles:['src/app.ts']});
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toMatchObject({message:'optimize: apply app patch',parents:['a'.repeat(40)]});
    await expect(commitOptimizationChanges('https://github.com/acme/app','forgeoptimizer/run-abcd',[{path:'../secrets.env',content:'no'}],'bad')).rejects.toThrow('Unsafe optimization file path');
  });

  it('lists branches and verifies an exact commit SHA server-side',async()=>{
    process.env.GITHUB_TOKEN='server-secret';
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json([{name:'main'},{name:'release'}])).mockResolvedValueOnce(Response.json({sha:'b'.repeat(40)}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(listRepositoryBranches('https://github.com/acme/app')).resolves.toEqual(['main','release']);
    await expect(inspectCommit('https://github.com/acme/app','b'.repeat(40))).resolves.toEqual({repository:'acme/app',commitSha:'b'.repeat(40)});
    await expect(inspectCommit('https://github.com/acme/app','bad')).rejects.toThrow('Commit SHA');
  });
});
