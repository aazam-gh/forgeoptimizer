import { describe, expect, it, vi } from 'vitest';
import { executeTrueForgeScenario } from './sandbox';
import { trueForgeConfig } from './trueforge';

describe('TrueForge sandbox execution boundary',()=>{
  it('never verifies a scenario when TrueForge is disabled',async()=>{
    trueForgeConfig.enabled=false;
    const result=await executeTrueForgeScenario({repositoryUrl:'fixture://app',commitSha:'abc123',scenario:{id:'fixture-tests',name:'Fixture tests',command:'pnpm test',cwd:'.',timeoutMs:120000,expectedExitStatus:0,category:'test',requiredEnv:[]}});
    expect(result).toMatchObject({scenarioId:'fixture-tests',status:'not_verified',quality:'NOT_VERIFIED'});
  });

  it('accepts only a validated measured remote result',async()=>{
    trueForgeConfig.enabled=true;
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({id:'session-1'})).mockResolvedValueOnce(new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"type":"model.message","content":"{\\"scenarioId\\":\\"fixture-tests\\",\\"status\\":\\"passed\\",\\"exitStatus\\":0,\\"quality\\":\\"MEASURED\\"}"}\n\n'));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}}));
    vi.stubGlobal('fetch',fetchMock);
    const result=await executeTrueForgeScenario({repositoryUrl:'fixture://app',commitSha:'abc123',scenario:{id:'fixture-tests',name:'Fixture tests',command:'pnpm test',cwd:'.',timeoutMs:120000,expectedExitStatus:0,category:'test',requiredEnv:[]}});
    expect(result).toMatchObject({scenarioId:'fixture-tests',status:'passed',exitStatus:0,quality:'MEASURED'});
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).agent.spec.config.sandbox).toEqual({enabled:true,file_downloads:false});
    trueForgeConfig.enabled=false;
  });

  it('rejects a passed label with the wrong exit status',async()=>{
    trueForgeConfig.enabled=true;
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({id:'session-1'})).mockResolvedValueOnce(new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"type":"model.message","content":"{\\"scenarioId\\":\\"fixture-tests\\",\\"status\\":\\"passed\\",\\"exitStatus\\":1,\\"quality\\":\\"MEASURED\\"}"}\n\n'));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}})));
    const result=await executeTrueForgeScenario({repositoryUrl:'fixture://app',commitSha:'abc123',scenario:{id:'fixture-tests',name:'Fixture tests',command:'pnpm test',cwd:'.',timeoutMs:120000,expectedExitStatus:0,category:'test',requiredEnv:[]}});
    expect(result).toMatchObject({status:'failed',quality:'MEASURED'});
    trueForgeConfig.enabled=false;
  });
});
