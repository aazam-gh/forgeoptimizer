import { describe, expect, it } from 'vitest';
import { analyzeFixture } from '../../../src/analyzer';
describe('inefficient AI fixture evaluation', () => {
  it('finds deterministic work and preserves legitimate semantic AI', () => {
    const result = analyzeFixture();
    expect(result.candidates.some((x) => x.category === 'Deterministic replacement' && x.confidence === 'HIGH')).toBe(true);
    expect(result.candidates.some((x) => x.title.includes('summaries'))).toBe(true);
    expect(result.usages.find((x) => x.functionName === 'summarize')?.purpose).toContain('arbitrary');
  });
});
