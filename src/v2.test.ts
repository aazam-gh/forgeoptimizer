import { describe, expect, it } from 'vitest';
import { analyzeFixture } from './analyzer';
import { baselineFromRun, buildOptimizationPlan, defaultScenario, evaluateCase, fingerprintRequest, instrumentInvocation, projectSavings, redactSecrets, safeMetadata } from './v2';

describe('V2 safety and evidence primitives', () => {
  it('redacts common provider secrets and fingerprints requests without storing raw prompts', () => {
    expect(redactSecrets('Authorization: Bearer sk-test_123456789012')).toContain('[REDACTED]');
    expect(fingerprintRequest('OpenAI', 'gpt-4.1', 'src/a.ts:4', 'private prompt')).toMatch(/^[0-9a-f]+$/);
    expect(safeMetadata({ response: { content: 'private prompt', apiKey: 'sk-test_123456789012' } }, 'redacted')).toEqual({ response: { content: '[REDACTED]', apiKey: '[REDACTED]' } });
  });

  it('requires a capture level and sanitizes successful and failed invocations', async () => {
    const metadata = { response: { content: 'private prompt', authorization: 'Bearer sk-test_123456789012' } };
    const success = await instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'redacted', metadata }, async () => 'ok');
    expect(success.invocation.captureLevel).toBe('redacted');
    expect(success.invocation.metadata).toEqual({ response: { content: '[REDACTED]', authorization: '[REDACTED]' } });

    await expect(instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'metadata_only', metadata }, async () => { throw new Error('failed'); })).rejects.toMatchObject({
      invocation: { captureLevel: 'metadata_only', metadata: { response: { content: '[REDACTED]', authorization: '[REDACTED]' } } },
    });

    const localOnly = await instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'full_local_only', metadata }, async () => 'ok');
    expect(localOnly.invocation.metadata).toEqual(metadata);
    metadata.response.content = 'changed after capture';
    expect(localOnly.invocation.metadata.response).toEqual({ content: 'private prompt', authorization: 'Bearer sk-test_123456789012' });

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const circularInvocation = await instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'redacted', metadata: circular }, async () => 'ok');
    expect(circularInvocation.invocation.metadata).toEqual({ self: '[Circular]' });
  });

  it('evaluates deterministic behavior and preserves baseline commit identity', () => {
    const evaluation = evaluateCase({ id: 'e1', name: 'same JSON', input: {}, expected: { ok: true }, evaluator: 'json', source: 'existing_test' }, '{"ok":true}', '{"ok":true}');
    expect(evaluation.passed).toBe(true);
    const baselineMismatch = evaluateCase({ id: 'e2', name: 'baseline mismatch', input: {}, expected: { ok: true }, evaluator: 'json', source: 'generated' }, '{"ok":false}', '{"ok":true}');
    expect(baselineMismatch.passed).toBe(false);
    expect(baselineMismatch.reason).toContain('baseline');
    const baseline = baselineFromRun('run-1', 'abc1234', defaultScenario, { calls: 1, tokens: 20, cost: 0.01, latencyMs: 50, quality: 'MEASURED' });
    expect(baseline.commitSha).toBe('abc1234');
  });

  it('ranks a dependency-aware plan and projects measured versus traffic-based savings', () => {
    const result = analyzeFixture();
    const plan = buildOptimizationPlan('run-1', result.candidates);
    expect(plan.steps.find(step => step.candidateId === 'c2')?.dependsOn).toEqual(['step-c1']);
    const projection = projectSavings(result.before, { ...result.before, cost: result.before.cost / 2 }, 100);
    expect(projection.monthlySavings).toBeGreaterThan(projection.dailySavings);
  });

  it('fails malformed evaluators safely and enforces medium risk caps', () => {
    const malformed = evaluateCase({ id: 'e2', name: 'bad JSON', input: {}, expected: {}, evaluator: 'json', source: 'generated' }, '{bad', '{also bad');
    expect(malformed.passed).toBe(false);
    expect(malformed.reason).toContain('Evaluator error');
    const result = analyzeFixture();
    const plan = buildOptimizationPlan('run-2', [...result.candidates, { ...result.candidates[0], id: 'high', risk: 'HIGH' }]);
    expect(plan.steps.some(step => step.candidateId === 'high')).toBe(false);
  });
});
