import type { AiUsage, Candidate, RunMetrics } from "./domain";
import { estimateCost } from "./pricing";
import { recommendModel } from "./modelRegistry";
const source = {
  "src/classifyTicket.ts": `import OpenAI from 'openai';\nconst client = new OpenAI();\nexport async function classifyTicket(text: string) {\n return client.chat.completions.create({ model: 'gpt-4.1', messages: [{ role: 'user', content: 'Choose one: billing, technical, account, other\\n' + text }] });\n}`,
  "src/normalizeOrder.ts": `export async function normalizeOrder(order: unknown) {\n return client.responses.create({ model: 'gpt-4.1', input: 'Convert this order to JSON: ' + JSON.stringify(order) });\n}`,
  "src/summarize.ts": `export async function summarize(document: string) {\n return client.chat.completions.create({ model: 'gpt-4.1', messages: [{ role: 'user', content: 'Summarize this document for a busy operator: ' + document }] });\n}`,
};
export function analyzeFixture(): {
  usages: AiUsage[];
  candidates: Candidate[];
  before: RunMetrics;
} {
  const cheaperModel = recommendModel("openai/gpt-4.1")?.id;
  const usages: AiUsage[] = [
    {
      id: "u1",
      file: "src/classifyTicket.ts",
      line: 4,
      functionName: "classifyTicket",
      provider: "OpenAI",
      model: "gpt-4.1",
      purpose: "Classify text into one of four known support categories",
      inputTokens: 620,
      outputTokens: 40,
      quality: "MEASURED",
    },
    {
      id: "u2",
      file: "src/normalizeOrder.ts",
      line: 2,
      functionName: "normalizeOrder",
      provider: "OpenAI",
      model: "gpt-4.1",
      purpose: "Transform an order object into a stable JSON shape",
      inputTokens: 980,
      outputTokens: 180,
      quality: "MEASURED",
    },
    {
      id: "u3",
      file: "src/normalizeOrder.ts",
      line: 2,
      functionName: "normalizeOrder",
      provider: "OpenAI",
      model: "gpt-4.1",
      purpose: "Repeated order normalization call with identical input",
      inputTokens: 980,
      outputTokens: 180,
      quality: "MEASURED",
    },
    {
      id: "u4",
      file: "src/summarize.ts",
      line: 2,
      functionName: "summarize",
      provider: "OpenAI",
      model: "gpt-4.1",
      purpose: "Summarize arbitrary natural-language documents",
      inputTokens: 4200,
      outputTokens: 520,
      quality: "ESTIMATED",
    },
  ];
  const d = (file: string, from: string, to: string) =>
    `--- a/${file}\n+++ b/${file}\n@@\n-${from}\n+${to}`;
  const candidates: Candidate[] = [
    {
      id: "c1",
      usageId: "u1",
      file: "src/classifyTicket.ts",
      line: 4,
      category: "Deterministic replacement",
      title: "Replace enum classification with a ruleset",
      finding:
        "The model chooses from four fixed labels; no semantic generation is needed.",
      recommendation:
        "Use a deterministic TypeScript classifier with keyword rules and an explicit fallback.",
      savingsPercent: 100,
      confidence: "HIGH",
      risk: "LOW",
      removesAi: true,
      diff: d(
        "src/classifyTicket.ts",
        "client.chat.completions.create(...)",
        "return classifyByRules(text);",
      ),
    },
    {
      id: "c2",
      usageId: "u2",
      file: "src/normalizeOrder.ts",
      line: 2,
      category: "Deterministic replacement",
      title: "Use schema validation for order normalization",
      finding:
        "The call transforms structured JSON into another structured JSON shape.",
      recommendation:
        "Replace the prompt with Zod validation and a typed mapping.",
      savingsPercent: 100,
      confidence: "HIGH",
      risk: "LOW",
      removesAi: true,
      dependsOn: ["c1"],
      diff: d(
        "src/normalizeOrder.ts",
        "client.responses.create(...)",
        "return normalizeOrderSchema.parse(order);",
      ),
    },
    {
      id: "c3",
      usageId: "u3",
      file: "src/normalizeOrder.ts",
      line: 2,
      category: "Duplicate calls",
      title: "Cache repeated order transformations",
      finding:
        "The same normalization operation is invoked repeatedly with identical input.",
      recommendation:
        "Memoize by stable order hash or share the in-flight promise.",
      savingsPercent: 50,
      confidence: "MEDIUM",
      risk: "MEDIUM",
      removesAi: false,
      diff: d(
        "src/normalizeOrder.ts",
        "return callModel(order);",
        "return cache.getOrSet(hash(order), () => callModel(order));",
      ),
    },
    {
      id: "c4",
      usageId: "u4",
      file: "src/summarize.ts",
      line: 2,
      category: "Context reduction",
      title: "Send only the relevant document section",
      finding:
        "The full document is placed in the prompt even when the operator asks about one section.",
      recommendation:
        "Extract the requested section before constructing model context.",
      savingsPercent: 34,
      confidence: "MEDIUM",
      risk: "MEDIUM",
      removesAi: false,
      diff: d(
        "src/summarize.ts",
        "document",
        "selectRelevantSection(document, question)",
      ),
    },
    {
      id: "c5",
      usageId: "u4",
      file: "src/summarize.ts",
      line: 2,
      category: "Cheaper model",
      title: `Route lightweight summaries to ${cheaperModel ?? "a reviewed cheaper model"}`,
      finding: "A routine summarization task is using a premium model.",
      recommendation: `Use the configurable model registry and benchmark ${cheaperModel ?? "a cheaper model"} against the exact baseline before rollout.`,
      savingsPercent: 82,
      confidence: "MEDIUM",
      risk: "MEDIUM",
      removesAi: false,
      changeType: "model",
      recommendedModel: cheaperModel,
      requiresBenchmark: true,
      diff: d(
        "src/summarize.ts",
        "model: 'gpt-4.1'",
        "model: selectSummaryModel(document.length)",
      ),
    },
  ];
  const totals = usages.reduce(
    (a, u) => {
      const c = estimateCost(u.model, u.inputTokens, u.outputTokens);
      return {
        calls: a.calls + 1,
        tokens: a.tokens + u.inputTokens + u.outputTokens,
        cost: a.cost + c.value,
      };
    },
    { calls: 0, tokens: 0, cost: 0 },
  );
  return {
    usages,
    candidates,
    before: { ...totals, latencyMs: 1840, quality: "MEASURED" },
  };
}
export function analyzeRepositorySource(
  files: { path: string; content: string }[],
): { usages: AiUsage[]; candidates: Candidate[]; before: RunMetrics } {
  const usages: AiUsage[] = [];
  const providers: [RegExp, string][] = [
    [/openai|chat\.completions|responses\.create/i, "OpenAI"],
    [/anthropic|messages\.create/i, "Anthropic"],
    [/gemini|generateContent/i, "Google"],
    [/generateText|streamText|vercel ai/i, "Vercel AI SDK"],
    [/langchain/i, "LangChain JS"],
    [/llamaindex/i, "LlamaIndex"],
  ];
  const callPattern =
    /chat\.completions|responses\.create|messages\.create|generateContent|generateText|streamText|\.invoke\s*\(/i;
  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!callPattern.test(line)) continue;
      const provider =
        providers.find(([pattern]) =>
          pattern.test(
            file.content.slice(
              Math.max(0, index - 20),
              Math.min(file.content.length, (index + 20) * 80),
            ),
          ),
        )?.[1] ?? "Unknown";
      const model = line.match(
        /(?:model|modelName)\s*[:=]\s*["'`]([^"'`]+)["'`]/i,
      )?.[1];
      const functionName =
        lines
          .slice(Math.max(0, index - 12), index + 1)
          .reverse()
          .find((item) =>
            /(?:function|const|async)\s+[A-Za-z_$][\w$]*/.test(item),
          )
          ?.match(/(?:function|const|async)\s+([A-Za-z_$][\w$]*)/)?.[1] ??
        "anonymous";
      usages.push({
        id: `source-${usages.length + 1}`,
        file: file.path,
        line: index + 1,
        functionName,
        provider,
        model,
        purpose: "Static provider call detected; runtime metrics not captured",
        inputTokens: 0,
        outputTokens: 0,
        quality: "INFERRED",
      });
    }
  }
  const before: RunMetrics = {
    calls: usages.length,
    tokens: 0,
    cost: 0,
    latencyMs: 0,
    quality: usages.length ? "INFERRED" : "NOT_VERIFIED",
  };
  return { usages, candidates: [], before };
}
export function applyCandidates(before: RunMetrics, candidates: Candidate[]) {
  const accepted = candidates.filter(
    (c) => c.accepted !== false && c.confidence === "HIGH",
  );
  const savings = accepted.reduce((s, c) => s + c.savingsPercent / 100, 0);
  return {
    calls: Math.max(1, before.calls - accepted.length),
    tokens: Math.round(before.tokens * Math.max(0.18, 1 - savings * 0.68)),
    cost: before.cost * Math.max(0.14, 1 - savings * 0.82),
    latencyMs: Math.round(before.latencyMs * 0.72),
    quality: "ESTIMATED" as const,
  };
}
export const fixtureSource = source;
