import { describe, expect, it } from 'vitest';
import { analyzeFixture } from './analyzer';
import { baselineFromRun, buildOptimizationPlan, defaultScenario, evaluateCase, fingerprintRequest, projectSavings, redactSecrets, safeMetadata } from './v2';

describe('V2 safety and evidence primitives', () => {
  it('redacts common provider secrets and fingerprints requests without storing raw prompts', () => {
    expect(redactSecrets('Authorization: Bearer sk-test_123456789012')).toContain('[REDACTED]');
    expect(fingerprintRequest('OpenAI', 'gpt-4.1', 'src/a.ts:4', 'private prompt')).toMatch(/^[0-9a-f]+$/);
    expect(safeMetadata({ response: { content: 'private prompt', apiKey: 'sk-test_123456789012' } }, 'redacted')).toEqual({ response: { content: '[REDACTED]', apiKey: '[REDACTED]' } });
  });

  it('evaluates deterministic behavior and preserves baseline commit identity', () => {
    const evaluation = evaluateCase({ id: 'e1', name: 'same JSON', input: {}, expected: { ok: true }, evaluator: 'json', source: 'existing_test' }, '{"ok":true}', '{"ok":true}');
    expect(evaluation.passed).toBe(true);
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
