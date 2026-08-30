# ForgeOptimizer hackathon demo

Use this flow for a short, repeatable demonstration of the V1 vertical slice.

## 1. Start the dashboard

```bash
pnpm install
pnpm dev
```

Open the local Vite URL and keep the default `fixture://inefficient-ai-app`
repository selected.

## 2. Show the waste map

Click **Analyze repository** and walk through the four detected AI usages:

- fixed-label classification that can become deterministic rules;
- structured order normalization that can become schema validation;
- repeated normalization that is a caching opportunity;
- legitimate document summarization that should remain AI-powered.

Call out that each opportunity includes confidence, risk, estimated savings,
and an explicit explanation. The demo deliberately distinguishes measured
fixture values from estimates.

## 3. Show the guarded optimization flow

Select the high-confidence opportunities, open the diff, and advance through
the optimization pipeline. The results screen shows the patch as **PROPOSED**
until the presenter clicks **Approve patch**. Only then does the decision log
mark the selected candidates **ACCEPTED**; approval still does not merge code.

## 4. Evidence to mention

Run the validation commands before the demo or include them in the PR:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

The current UI uses a safe fixture and does not execute arbitrary repository
code on the host. Real GitHub import, sandbox execution, durable run storage,
and live TrueForge sessions remain the next implementation slice.
