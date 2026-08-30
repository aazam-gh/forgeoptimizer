import { describe, expect, it } from 'vitest';
import { analyzeFixture } from './analyzer';
import { baselineFromRun, buildOptimizationPlan, defaultOptimizationPolicy, defaultScenario, evaluateCase, fingerprintRequest, instrumentInvocation, projectSavings, redactSecrets, safeMetadata } from './v2';

describe('V2 safety and evidence primitives', () => {
  it('redacts common provider secrets and fingerprints requests without storing raw prompts', async () => {
    expect(redactSecrets('Authorization: Bearer sk-test_123456789012')).toContain('[REDACTED]');
    await expect(fingerprintRequest('OpenAI', 'gpt-4.1', 'src/a.ts:4', 'private prompt')).resolves.toMatch(/^fp:v2:[0-9a-f]{64}$/);
    expect(safeMetadata({ response: { prompt: 'private prompt', contentType: 'text/plain', inputTokens: 12, apiKey: 'sk-test_123456789012' } }, 'redacted')).toEqual({ response: { prompt: '[REDACTED]', contentType: 'text/plain', inputTokens: 12, apiKey: '[REDACTED]' } });
  });

  it('requires a capture level and sanitizes successful and failed invocations', async () => {
    const metadata: Record<string, unknown> = { response: { prompt: 'private prompt', authorization: 'Bearer sk-test_123456789012' } };
    const success = await instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'redacted', metadata }, async () => 'ok');
    expect(success.invocation.captureLevel).toBe('redacted');
    expect(success.invocation.metadata).toEqual({ response: { prompt: '[REDACTED]', authorization: '[REDACTED]' } });

    await expect(instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'metadata_only', metadata }, async () => { throw new Error('failed'); })).rejects.toMatchObject({
      invocation: { captureLevel: 'metadata_only', metadata: { response: { prompt: '[REDACTED]', authorization: '[REDACTED]' } } },
    });

    const localOnly = await instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'full_local_only', metadata }, async () => 'ok');
    expect(localOnly.invocation.metadata).toEqual({ response: { prompt: 'private prompt', authorization: '[REDACTED]' } });
    (metadata.response as Record<string, unknown>).content = 'changed after capture';
    expect(localOnly.invocation.metadata.response).toEqual({ prompt: 'private prompt', authorization: '[REDACTED]' });

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const circularInvocation = await instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'redacted', metadata: circular }, async () => 'ok');
    expect(circularInvocation.invocation.metadata).toEqual({ self: '[Circular]' });

    const shared = { contentType: 'application/json' };
    const sharedMetadata = await instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'redacted', metadata: { first: shared, second: shared } }, async () => 'ok');
    expect(sharedMetadata.invocation.metadata).toEqual({ first: { contentType: 'application/json' }, second: { contentType: 'application/json' } });

    const values = { date: new Date('2026-01-01T00:00:00.000Z'), map: new Map([['status', 'ok']]), set: new Set(['cache-hit']), error: new Error('provider failed') };
    const localValues = await instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'full_local_only', metadata: values }, async () => 'ok');
    expect(localValues.invocation.metadata.date).toEqual(values.date);
    expect(localValues.invocation.metadata.map).toEqual(values.map);
    expect(localValues.invocation.metadata.set).toEqual(values.set);
    expect(localValues.invocation.metadata.error).toBeInstanceOf(Error);
    expect((localValues.invocation.metadata.error as Error).message).toBe('provider failed');
    const sensitiveError = new Error('Authorization: Bearer sk-test_123456789012');
    const sensitive = await instrumentInvocation({ provider: 'OpenAI', callSite: { file: 'src/a.ts', line: 4 }, captureLevel: 'full_local_only', metadata: { map: new Map([['authorization', 'Bearer sk-test_123456789012']]), error: sensitiveError } }, async () => 'ok');
    expect(sensitive.invocation.metadata.map).toEqual(new Map([['authorization', '[REDACTED]']]));
    expect((sensitive.invocation.metadata.error as Error).message).toContain('[REDACTED]');
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

  it('uses candidate evidence when calculating plan scores', () => {
    const result = analyzeFixture();
    const candidate = { ...result.candidates[0], frequencyPerDay: 10000, testCoverage: .9, complexity: 2 };
    const plan = buildOptimizationPlan('evidence-score', [candidate]);
    expect(plan.steps[0].score).toBe(plan.steps[0].scoreBreakdown?.value);
    expect(plan.steps[0].score).not.toBe(buildOptimizationPlan('default-score', [result.candidates[0]]).steps[0].score);
  });

  it('normalizes whitespace when fingerprinting equivalent requests', async () => {
    await expect(fingerprintRequest('OpenAI', 'gpt-4.1', 'src/a.ts:4', 'one  two\nthree')).resolves.toBe(await fingerprintRequest('openai', 'gpt-4.1', 'src/a.ts:4', ' one two\tthree '));
  });

  it('rejects plans with filtered, missing, or circular dependencies', () => {
    const result = analyzeFixture();
    const filteredPrerequisite = { ...result.candidates[0], risk: 'HIGH' as const };
    const dependent = { ...result.candidates[1], dependsOn: [filteredPrerequisite.id] };
    const filteredPlan = buildOptimizationPlan('run-filtered-dependency', [filteredPrerequisite, dependent]);
    expect(filteredPlan.valid).toBe(false);
    expect(filteredPlan.validationErrors.join(' ')).toContain('filtered');

    const missingPlan = buildOptimizationPlan('run-missing-dependency', [{ ...result.candidates[1], dependsOn: ['missing'] }]);
    expect(missingPlan.valid).toBe(false);
    expect(missingPlan.validationErrors.join(' ')).toContain('missing');

    const circularPlan = buildOptimizationPlan('run-circular-dependency', [
      { ...result.candidates[0], dependsOn: [result.candidates[1].id] },
      { ...result.candidates[1], dependsOn: [result.candidates[0].id] },
    ]);
    expect(circularPlan.valid).toBe(false);
    expect(circularPlan.validationErrors.join(' ')).toContain('cycle');
  });

  it('excludes cheaper-model candidates when model changes are forbidden', () => {
    const result = analyzeFixture();
    const policy = { ...defaultOptimizationPolicy, allowModelChanges: false };
    const blockedPlan = buildOptimizationPlan('run-policy-blocked', result.candidates, policy);
    expect(blockedPlan.steps.some(step => step.candidateId === 'c5')).toBe(false);

    const allowedPlan = buildOptimizationPlan('run-policy-allowed', result.candidates, { ...policy, allowModelChanges: true });
    expect(allowedPlan.steps.some(step => step.candidateId === 'c5')).toBe(true);
  });

  it('enforces explicit prompt and dependency change policies', () => {
    const result = analyzeFixture();
    const promptBlocked = buildOptimizationPlan('run-prompt-blocked', [{ ...result.candidates[3], changeType: 'prompt' }], { ...defaultOptimizationPolicy, allowPromptChanges: false });
    expect(promptBlocked.steps).toHaveLength(0);
    const dependencyBlocked = buildOptimizationPlan('run-dependency-blocked', [{ ...result.candidates[0], changeType: 'dependency' }], { ...defaultOptimizationPolicy, allowDependencyChanges: false });
    expect(dependencyBlocked.steps).toHaveLength(0);
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
