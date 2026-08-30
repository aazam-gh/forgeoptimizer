import type { AIInvocation } from "./domain";

export type CrossCallFinding = {
  kind:
    | "duplicate_semantic_request"
    | "repeated_context"
    | "context_dominates_cost";
  fingerprint?: string;
  invocationIds: string[];
  title: string;
  detail: string;
  confidence: "HIGH" | "MEDIUM";
};

function numericMetadata(invocation: AIInvocation, key: string): number {
  const value = invocation.metadata[key];
  return typeof value === "number" ? value : 0;
}

export function analyzeCrossCallUsage(
  invocations: AIInvocation[],
): CrossCallFinding[] {
  const findings: CrossCallFinding[] = [];
  const byFingerprint = new Map<string, AIInvocation[]>();
  for (const invocation of invocations) {
    if (invocation.requestFingerprint) {
      const group = byFingerprint.get(invocation.requestFingerprint) ?? [];
      group.push(invocation);
      byFingerprint.set(invocation.requestFingerprint, group);
    }
  }
  for (const [fingerprint, group] of byFingerprint) {
    if (group.length > 1)
      findings.push({
        kind: "duplicate_semantic_request",
        fingerprint,
        invocationIds: group.map((item) => item.id),
        title: "Repeated semantic request",
        detail: `The same request fingerprint was observed ${group.length} times across ${new Set(group.map((item) => item.callSite.file)).size} file(s). Consider a shared cache or request coalescing.`,
        confidence: "HIGH",
      });
  }
  for (const invocation of invocations) {
    const input =
      numericMetadata(invocation, "inputTokens") || invocation.inputTokens || 0;
    const declaredContext = invocation.contextTokens
      ? Object.values(invocation.contextTokens).reduce(
          (sum, value) => sum + (typeof value === "number" ? value : 0),
          0,
        )
      : 0;
    const retrieved =
      numericMetadata(invocation, "retrievedTokens") ||
      numericMetadata(invocation, "contextTokens") ||
      declaredContext;
    if (input > 0 && retrieved > input * 0.6)
      findings.push({
        kind: "context_dominates_cost",
        invocationIds: [invocation.id],
        title: "Context dominates input cost",
        detail: `Retrieved/context tokens account for ${Math.round((retrieved / input) * 100)}% of the recorded input budget. Reduce or filter context before changing models.`,
        confidence: "MEDIUM",
      });
  }
  const byContext = new Map<string, AIInvocation[]>();
  for (const invocation of invocations) {
    const context =
      typeof invocation.metadata.contextFingerprint === "string"
        ? invocation.metadata.contextFingerprint
        : undefined;
    if (context) {
      const group = byContext.get(context) ?? [];
      group.push(invocation);
      byContext.set(context, group);
    }
  }
  for (const group of byContext.values()) {
    if (group.length > 1)
      findings.push({
        kind: "repeated_context",
        invocationIds: group.map((item) => item.id),
        title: "Repeated retrieval context",
        detail: `The same context fingerprint was attached to ${group.length} invocations. Cache retrieval or share the context where semantics allow.`,
        confidence: "MEDIUM",
      });
  }
  return findings;
}
