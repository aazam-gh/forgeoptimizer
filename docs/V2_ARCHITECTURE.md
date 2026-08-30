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
- `src/trueforge.ts` calls the same-origin `/api/trueforge` proxy when enabled;
  the Vite server attaches the server-only key and falls back explicitly to
  deterministic mode when the proxy is unavailable.
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

1. Run `npx @truefoundry/trueforge@0.1.4 --port 8790`.
2. Copy `.env.example` to `.env`.
3. Keep `TRUEFORGE_API_KEY` server-only; set `VITE_TRUEFORGE_PROXY_ENABLED=true` to enable the proxy path.
4. Run `pnpm dev` and open `http://localhost:5188`.
5. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm lint`.

The V2 development server includes a local SQLite run store at `.data/forgeoptimizer.sqlite`. Its API boundary includes run creation, lifecycle, candidate, plan, result, approval, publish, and event endpoints under `/api/runs` and `/api/candidates`. This persists safe orchestration state and agent events; target repositories are not executed by this host-side API.
