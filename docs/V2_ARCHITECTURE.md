# ForgeOptimizer V2 architecture

V2 preserves the fixture-backed V1 dashboard and adds typed production boundaries
around the north-star flow: **Private Repository → Measure → Understand →
Optimize → Prove → PR**.

## Implemented foundation

- `src/domain.ts` defines repository-run records for scenarios, baselines,
  invocations, evaluations, plans, policies, projections, branches, and PRs.
- `src/v2.ts` provides redaction, metadata capture, request fingerprinting,
  provider-neutral invocation instrumentation, deterministic evaluators,
  explainable candidate scoring, dependency-aware plans, baseline identity,
  savings projections, and PR report generation.
- `src/trueforge.ts` can create a real local TrueForge session when an API key is
  configured; local deterministic mode remains the safe default.
- `docs/HACKATHON_DEMO.md` remains the stable V1 presentation path.

## Safety boundaries

Raw prompts are not persisted by the new helpers unless `full_local_only` is
selected. Common provider and GitHub token formats are redacted. Evaluations
prefer deterministic comparisons. Approval is required before publishing a PR;
there is no automatic merge or default-branch push.

## Explicitly not verified yet

This repository still needs a server-side store/migrations, GitHub OAuth and
private-repository MCP authorization, sandbox process execution, real runtime
hooks for OpenAI/Anthropic/Gemini/framework adapters, and a UI/API that drives
the new records end to end. Those require credentials and provider contracts;
the current V2 foundation exposes the interfaces without claiming those
external integrations are live.

## Local setup

1. Run `npx @truefoundry/trueforge@latest --port 8790`.
2. Copy `.env.example` to `.env`.
3. Add a TrueForge API key only when the local server is configured for one.
4. Run `pnpm dev` and open `http://localhost:5188`.
5. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm lint`.
