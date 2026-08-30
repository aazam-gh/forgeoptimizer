import { describe, expect, it } from "vitest";
import { analyzeFixture, analyzeRepositorySource } from "./analyzer";

describe("fixture candidate generation", () => {
  it("derives model-change recommendations from the central registry", () => {
    const candidate = analyzeFixture().candidates.find(
      (item) => item.id === "c5",
    );
    expect(candidate).toMatchObject({
      changeType: "model",
      recommendedModel: "google/gemini-2.5-flash",
      requiresBenchmark: true,
    });
    expect(candidate?.recommendation).toContain("benchmark");
  });
});
describe("repository source analysis", () => {
  it("reports supported provider call sites as inferred evidence", () => {
    const result = analyzeRepositorySource([
      {
        path: "src/ai.ts",
        content:
          'import OpenAI from "openai";\nexport async function answer(){\n return client.chat.completions.create({model: "gpt-4.1"});\n}',
      },
    ]);
    expect(result.usages).toMatchObject([
      {
        file: "src/ai.ts",
        line: 3,
        provider: "OpenAI",
        model: "gpt-4.1",
        quality: "INFERRED",
      },
    ]);
    expect(result.before).toMatchObject({
      calls: 1,
      tokens: 0,
      cost: 0,
      quality: "INFERRED",
    });
  });
});
