import { describe, expect, it } from "vitest";
import { runOptimizationLoop } from "./optimizationLoop";
import type { Candidate, OptimizationPlan } from "./domain";

const candidate = (id: string): Candidate => ({
  id,
  usageId: id,
  file: "src/app.ts",
  line: 1,
  category: "Context reduction",
  title: id,
  finding: "finding",
  recommendation: "recommendation",
  savingsPercent: 10,
  confidence: "HIGH",
  risk: "LOW",
  removesAi: false,
  diff: "",
});
const plan: OptimizationPlan = {
  id: "plan-1",
  runId: "run-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  steps: [
    {
      id: "step-a",
      candidateId: "a",
      title: "a",
      dependsOn: [],
      score: 1,
      status: "queued",
    },
    {
      id: "step-b",
      candidateId: "b",
      title: "b",
      dependsOn: ["step-a"],
      score: 0.5,
      status: "queued",
    },
  ],
  expectedSavingsPercent: 20,
  risk: "LOW",
  valid: true,
  validationErrors: [],
};

describe("bounded autonomous optimization loop", () => {
  it("keeps successful candidates and reverts a failed candidate", async () => {
    const result = await runOptimizationLoop(
      plan,
      [candidate("a"), candidate("b")],
      async (current) => ({
        passed: current.id === "a",
        detail: current.id === "a" ? "tests passed" : "behavioral regression",
      }),
    );
    expect(result.acceptedCandidateIds).toEqual(["a"]);
    expect(result.plan.steps.map((step) => step.status)).toEqual([
      "passed",
      "reverted",
    ]);
  });

  it("stops before exceeding candidate budget", async () => {
    const result = await runOptimizationLoop(
      plan,
      [candidate("a"), candidate("b")],
      async () => ({ passed: true, detail: "passed" }),
      {
        maxAgentCost: 5,
        maxTrueForgeIterations: 20,
        maxParallelSubAgents: 4,
        maxCandidates: 1,
        maxRuntimeMs: 900000,
        maxSandboxExecutions: 20,
      },
    );
    expect(result.acceptedCandidateIds).toEqual(["a"]);
    expect(result.stopReason).toBe("Optimization budget reached");
    expect(result.plan.steps[1].status).toBe("skipped");
  });

  it("skips dependents when a prerequisite is reverted", async () => {
    const result = await runOptimizationLoop(
      plan,
      [candidate("a"), candidate("b")],
      async () => ({ passed: false, detail: "regression" }),
    );
    expect(result.plan.steps.map((step) => step.status)).toEqual([
      "reverted",
      "skipped",
    ]);
    expect(result.attempts[1]).toMatchObject({
      candidateId: "b",
      status: "skipped",
    });
  });

  it("charges the configured number of sandbox executions per candidate", async () => {
    const result = await runOptimizationLoop(
      plan,
      [candidate("a"), candidate("b")],
      async () => ({ passed: true, detail: "passed" }),
      {
        maxAgentCost: 5,
        maxTrueForgeIterations: 20,
        maxParallelSubAgents: 4,
        maxCandidates: 25,
        maxRuntimeMs: 900000,
        maxSandboxExecutions: 1,
      },
      2,
    );
    expect(result.acceptedCandidateIds).toEqual([]);
    expect(result.stopReason).toBe("Optimization budget reached");
    expect(result.plan.steps[0].status).toBe("skipped");
  });

  it("rejects a candidate when its TrueForge iteration cost exceeds budget", async () => {
    const result = await runOptimizationLoop(
      plan,
      [candidate("a"), candidate("b")],
      async () => ({
        passed: true,
        detail: "passed",
        trueForgeIterations: 2,
      }),
      {
        maxAgentCost: 5,
        maxTrueForgeIterations: 1,
        maxParallelSubAgents: 4,
        maxCandidates: 25,
        maxRuntimeMs: 900000,
        maxSandboxExecutions: 20,
      },
    );
    expect(result.acceptedCandidateIds).toEqual([]);
    expect(result.plan.steps[0].status).toBe("reverted");
  });
});
