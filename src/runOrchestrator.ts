import type {
  Candidate,
  EvaluationResult,
  OptimizationBudget,
  OptimizationScenario,
  Run,
  ScenarioExecutionResult,
} from "./domain";
import { defaultOptimizationBudget } from "./budget";
import { executeScenarios, type SandboxExecutor } from "./scenarios";
import {
  createWorkflowState,
  markOptimizationReverted,
  recordOptimizationCommit,
} from "./gitWorkflow";
import { runOptimizationLoop } from "./optimizationLoop";
import { assessValidationGate, type ValidationGateResult } from "./validation";
import { transitionRun } from "./runState";
import { validateCandidatePatch } from "./patchValidation";
import { buildOptimizationPlan } from "./v2";

export type RunOrchestrationAdapters = {
  scenario: OptimizationScenario | OptimizationScenario[];
  baselineCommitSha: string;
  sandbox: SandboxExecutor;
  applyCandidate: (candidate: Candidate) => Promise<{ commitSha: string }>;
  revertCandidate: (candidate: Candidate, commitSha: string) => Promise<void>;
  evaluateCandidate?: (candidate: Candidate) => Promise<EvaluationResult[]>;
  benchmarkCandidate?: (candidate: Candidate) => Promise<boolean>;
};
export type RunOrchestrationResult = {
  run: Run;
  baseline: ScenarioExecutionResult;
  baselineResults: ScenarioExecutionResult[];
  candidateResults: ScenarioExecutionResult[];
  validation: ValidationGateResult;
  workflow: ReturnType<typeof createWorkflowState>;
};

function withStatus(
  run: Run,
  status: Run["status"],
  metadata: Parameters<typeof transitionRun>[2] = {},
): Run {
  return transitionRun(run, status, metadata);
}

export async function executeOptimizationRun(
  initialRun: Run,
  candidates: Candidate[],
  adapters: RunOrchestrationAdapters,
  budget: OptimizationBudget = defaultOptimizationBudget,
): Promise<RunOrchestrationResult> {
  let run = withStatus(initialRun, "preparing", { stage: "preparing" });
  run = withStatus(run, "analyzing", { stage: "analyzing" });
  run = withStatus(run, "baseline_running", { stage: "baseline_running" });
  const scenarios = Array.isArray(adapters.scenario)
    ? adapters.scenario
    : [adapters.scenario];
  const baselineResults = await executeScenarios(adapters.sandbox, {
    scenarios,
    commitSha: adapters.baselineCommitSha,
    repositoryUrl: run.repositoryUrl,
  });
  const baseline =
    baselineResults.find((result) => result.status !== "passed") ??
    baselineResults[0];
  let workflow = createWorkflowState({
    baseBranch: "main",
    baseCommitSha: adapters.baselineCommitSha,
    optimizationBranch: `forgeoptimizer/run-${run.id.slice(0, 8)}`,
  });
  const evaluationResults: EvaluationResult[] = [];
  run = withStatus(run, "planning", { stage: "planning" });
  const candidateResults: ScenarioExecutionResult[] = [];
  const plan = buildOptimizationPlan(`plan-${run.id}`, candidates);
  const loop = plan.valid
    ? await runOptimizationLoop(
        plan,
        candidates,
        async (candidate) => {
          const patch = validateCandidatePatch(candidate.diff);
          if (!patch.valid || patch.changedFiles.length === 0)
            return {
              passed: false,
              detail:
                patch.errors.join("; ") ||
                "Patch rejected: no changed files identified",
            };
          if (candidate.requiresBenchmark) {
            if (!adapters.benchmarkCandidate)
              return {
                passed: false,
                detail:
                  "Model-change candidate rejected: benchmark evidence is unavailable",
              };
            if (!(await adapters.benchmarkCandidate(candidate)))
              return {
                passed: false,
                detail:
                  "Model-change candidate rejected: benchmark quality floor failed",
              };
          }
          run = withStatus(run, "optimizing", {
            stage: "optimizing",
            activeCandidateId: candidate.id,
          });
          const applied = await adapters.applyCandidate(candidate);
          workflow = recordOptimizationCommit(
            workflow,
            candidate,
            applied.commitSha,
          );
          const scenarioResults = await executeScenarios(adapters.sandbox, {
            scenarios,
            commitSha: applied.commitSha,
            repositoryUrl: run.repositoryUrl,
          });
          candidateResults.push(...scenarioResults);
          const evaluations = adapters.evaluateCandidate
            ? await adapters.evaluateCandidate(candidate)
            : [];
          evaluationResults.push(...evaluations);
          const passed =
            scenarioResults.length === scenarios.length &&
            scenarioResults.every(
              (result) =>
                result.status === "passed" && result.quality === "MEASURED",
            ) &&
            evaluations.every((result) => result.passed);
          if (!passed) {
            await adapters.revertCandidate(candidate, applied.commitSha);
            workflow = markOptimizationReverted(
              workflow,
              candidate.id,
              "scenario or evaluation failed",
            );
          }
          return {
            passed,
            detail: passed
              ? "Scenario and evaluations passed"
              : "Candidate reverted after validation failure",
          };
        },
        budget,
        scenarios.length,
      )
    : {
        plan,
        attempts: [],
        acceptedCandidateIds: [],
        remainingCandidateIds: [],
        stopReason:
          plan.validationErrors.join("; ") || "Optimization plan is invalid",
      };
  run = withStatus(run, "validating", { stage: "validating" });
  const scenarioCount = scenarios.length;
  const lastCandidateResults = candidateResults.slice(-scenarioCount);
  const candidateScenario =
    lastCandidateResults.find((result) => result.status !== "passed") ??
    lastCandidateResults.at(-1) ??
    baseline;
  const baselineTests = {
    testsPassed: baselineResults.filter((result) => result.status === "passed")
      .length,
    testsFailed: baselineResults.filter((result) => result.status !== "passed")
      .length,
  };
  const candidateTests = {
    testsPassed: lastCandidateResults.filter(
      (result) => result.status === "passed",
    ).length,
    testsFailed: lastCandidateResults.filter(
      (result) => result.status !== "passed",
    ).length,
  };
  const validation = assessValidationGate({
    baseline: baselineTests,
    candidate: candidateTests,
    scenario: candidateScenario,
    evaluations: evaluationResults,
  });
  run = withStatus(run, "reviewing", { stage: "reviewing" });
  run = withStatus(
    run,
    validation.state === "PASS" ? "awaiting_approval" : "fallback",
    {
      stage: validation.state === "PASS" ? "awaiting_approval" : "fallback",
      fallbackReason:
        validation.state === "PASS" ? undefined : "validation-incomplete",
    },
  );
  return {
    run,
    baseline,
    baselineResults,
    candidateResults,
    validation,
    workflow: {
      ...workflow,
      commits: workflow.commits.map((commit) =>
        loop.acceptedCandidateIds.includes(commit.candidateId)
          ? commit
          : { ...commit, status: "reverted" },
      ),
    },
  };
}
