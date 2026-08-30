# ForgeOptimizer

ForgeOptimizer analyzes a software repository for unnecessary AI usage, proposes evidence-backed optimizations, shows a patch, and validates the savings against tests and benchmarks.

## V1 vertical slice

The included `fixture://inefficient-ai-app` demonstrates:

- LLM enum classification → deterministic rules
- LLM JSON transformation → schema/mapping code
- repeated calls → caching candidate
- oversized context → context reduction candidate
- premium model on a lightweight task → configurable cheaper-model candidate
- legitimate semantic summarization → detected, but not proposed as deterministic replacement

The dashboard runs the fixture analysis without provider credentials. It labels fixture metrics as measured or estimated in the domain model. The optimization screen represents the isolated patch/test/benchmark/review pipeline, and the results screen requires an explicit patch approval action.

## Run it

Requirements: Node 22+ and pnpm.

```bash
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

Open the Vite URL and click **Analyze repository**. The default fixture URL is ready to run.

The local development server also exposes a SQLite-backed run API at `/api/runs`. Create a run with `POST /api/runs`, inspect candidates/results with `GET /api/runs/:id/candidates` and `GET /api/runs/:id/results`, start or cancel it with `POST /api/runs/:id/start` and `POST /api/runs/:id/cancel`, submit a plan with `POST /api/runs/:id/plan`, append events with `POST /api/runs/:id/events`, approve with `POST /api/runs/:id/approve`, publish with `POST /api/runs/:id/publish`, approve or reject candidates with `POST /api/candidates/:id/approve` and `POST /api/candidates/:id/reject`, and consume persisted agent events from `GET /api/runs/:id/events`. The database is created under `.data/` and is ignored by Git.

## TrueForge

TrueForge is the intended orchestration runtime for the root Optimization Orchestrator. The browser calls a same-origin proxy in `src/trueforge.ts`; the Vite server keeps `TRUEFORGE_API_KEY` server-side and falls back explicitly to local deterministic analysis when the proxy is unavailable. Start the pinned local server with `npx @truefoundry/trueforge@0.1.4 --port 8790`, then configure `.env` from `.env.example`.

Project Skills live under `skills/` and are designed for on-demand loading: repository mapping, LLM audit, deterministic replacement, cost analysis, benchmarking, and review. GitHub MCP is an extension point for public repository access; V1's included fixture keeps the demo safe and repeatable without cloning or executing untrusted code on the host.

## Architecture

- `src/analyzer.ts`: deterministic fixture analysis, candidate generation, and before/after estimate
- `src/pricing.ts`: centralized configurable model pricing
- `src/domain.ts`: run, event, usage, candidate, and benchmark contracts
- `src/trueforge.ts`: TrueForge orchestration boundary
- `src/App.tsx`: dashboard, agent progress, candidates, patch pipeline, diff, and results
- `fixtures/inefficient-ai-app`: known evaluation fixture
- `skills/*/SKILL.md`: project-specific TrueForge Skills

## Current limitations

The local V2 foundation now includes durable run snapshots, lifecycle/approval guards, TrueForge session streaming, provider-neutral instrumentation, cross-call analysis, validated sandbox contracts, and a bounded reversible optimization loop. The default demo remains deterministic unless the same-origin TrueForge proxy is enabled. Private GitHub OAuth/MCP authorization, remote patch/branch/PR creation, live provider SDK hooks, and full repository AST execution still require configured external integrations. No repository code is executed on the host, and no patch is merged automatically.
