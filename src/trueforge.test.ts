import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTrueForgeOrchestrator, trueForgeConfig } from './trueforge';

const streamResponse=(events:unknown[])=>new Response(new ReadableStream({start(controller){const encoder=new TextEncoder();for(const event of events)controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});

describe('TrueForge session and turn integration',()=>{
  afterEach(()=>{vi.unstubAllGlobals();trueForgeConfig.enabled=false;});

  it('creates a session, executes a turn, maps events, and captures the result',async()=>{
    trueForgeConfig.enabled=true;
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({id:'session-1'})).mockResolvedValueOnce(streamResponse([
      {type:'turn.created',id:'turn-1'},
      {type:'thread.created',thread_id:'sub-agent-1'},
      {type:'model.message.delta',content:'working'},
      {type:'model.message',content:'{"candidates":[]}'},
      {type:'turn.done'},
    ]));
    vi.stubGlobal('fetch',fetchMock);
    const events=[] as {label:string;status:string;detail:string}[];
    const result=await runTrueForgeOrchestrator('fixture://app',event=>events.push(event));
    expect(result).toMatchObject({mode:'trueforge',sessionId:'session-1',turnId:'turn-1',finalResult:{candidates:[]}});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/trueforge/sessions/session-1/turns');
    expect(events.some(event=>event.label==='TrueForge sub-agent')).toBe(true);
    expect(events.some(event=>event.status==='complete')).toBe(true);
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
