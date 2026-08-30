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

The V1 UI is a working local vertical slice, while arbitrary GitHub cloning, durable SQLite persistence, real sandbox execution, runtime instrumentation, and the exact installed TrueForge SDK session calls still need to be wired after validating the local TrueForge server/API version. No repository code is executed on the host, and no patch is merged automatically.

## V2

Add a small server-side run store, sandbox provider adapter, GitHub MCP repository import, real TrueForge session streaming, AST analyzers for TypeScript/Python, patch application and rollback, and measured baseline/after benchmarks.
