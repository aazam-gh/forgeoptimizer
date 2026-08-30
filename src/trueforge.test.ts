import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractTrueForgeAnalysis, runTrueForgeOrchestrator, trueForgeConfig } from './trueforge';

const streamResponse=(events:unknown[])=>new Response(new ReadableStream({start(controller){const encoder=new TextEncoder();for(const event of events)controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});

describe('TrueForge session and turn integration',()=>{
  afterEach(()=>{vi.unstubAllGlobals();trueForgeConfig.enabled=false;});

  it('accepts only schema-checked structured optimization evidence',()=>{const result=extractTrueForgeAnalysis({analysis:{usages:[{id:'u',file:'src/a.ts',line:1,functionName:'a',provider:'OpenAI',purpose:'test',inputTokens:10,outputTokens:2,quality:'MEASURED'}],candidates:[{id:'c',usageId:'u',file:'src/a.ts',line:1,category:'Context reduction',title:'candidate',finding:'finding',recommendation:'recommendation',savingsPercent:10,confidence:'HIGH',risk:'LOW',removesAi:false,diff:'diff'}],before:{calls:1,tokens:12,cost:.01,latencyMs:20,quality:'MEASURED'}}});expect(result?.candidates).toHaveLength(1);expect(extractTrueForgeAnalysis({analysis:{before:{calls:1}}})).toBeUndefined();});

  it('creates a session, executes a turn, maps events, and captures the result',async()=>{
    trueForgeConfig.enabled=true;
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({id:'session-1'})).mockResolvedValueOnce(streamResponse([
      {type:'turn.created',id:'turn-1'},
      {type:'thread.created',thread_id:'sub-agent-1'},
      {type:'model.message.delta',content:'working'},
      {type:'model.message',content:'{"candidates":[],"files":[{"path":"src/app.ts","content":"export const ok=true;"}]}'},
      {type:'turn.done'},
    ]));
    vi.stubGlobal('fetch',fetchMock);
    const events=[] as {label:string;status:string;detail:string}[];
    const result=await runTrueForgeOrchestrator('fixture://app',event=>events.push(event));
    expect(result).toMatchObject({mode:'trueforge',sessionId:'session-1',turnId:'turn-1',finalResult:{candidates:[]},patchFiles:[{path:'src/app.ts',content:'export const ok=true;'}]});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/trueforge/sessions/session-1/turns');
    expect(events.some(event=>event.label==='TrueForge sub-agent')).toBe(true);
    expect(events.some(event=>event.status==='complete')).toBe(true);
  });

  it('ignores unsafe structured patch files while retaining the final result',async()=>{
    trueForgeConfig.enabled=true;
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({id:'session-2'})).mockResolvedValueOnce(streamResponse([{type:'model.message',content:'{"files":[{"path":"../secrets.env","content":"no"}]}'},{type:'turn.done'}])));
    const result=await runTrueForgeOrchestrator('fixture://app',()=>undefined,{maxRetries:0});
    expect(result.finalResult).toMatchObject({files:[{path:'../secrets.env'}]});
    expect(result.patchFiles).toEqual([]);
  });

  it('returns an explicit deterministic fallback when TrueForge fails',async()=>{
    trueForgeConfig.enabled=true;
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('server unavailable')));
    const events=[] as {label:string;status:string;detail:string}[];
    const result=await runTrueForgeOrchestrator('fixture://app',event=>events.push(event),{maxRetries:0});
    expect(result).toMatchObject({mode:'local-deterministic',fallbackReason:'trueforge-unavailable',failureReason:'server unavailable'});
    expect(events.at(-1)).toMatchObject({label:'TrueForge failed',status:'blocked'});
  });
});
