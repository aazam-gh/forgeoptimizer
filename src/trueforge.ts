import type {
  AgentEvent,
  AiUsage,
  Candidate,
  OptimizationBudget,
  RunMetrics,
  ValidationSnapshot,
} from "./domain";
import { normalizePatchPayload, type PatchFile } from "./patchPayload";

export const trueForgeConfig = {
  url: import.meta.env.VITE_TRUEFORGE_URL ?? "http://localhost:8790",
  model: import.meta.env.VITE_TRUEFORGE_MODEL ?? "openai/gpt-4.1-mini",
  proxyPath: "/api/trueforge",
  enabled: import.meta.env.VITE_TRUEFORGE_PROXY_ENABLED === "true",
};
type TrueForgeSession = { id: string; status?: string };
type TrueForgeTurn = { id: string; state?: string };
type TrueForgeEvent = {
  type?: string;
  id?: string;
  thread_id?: string;
  content?: unknown;
  state?: string;
  detail?: string;
  [key: string]: unknown;
};
export type TrueForgeRunOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  task?: string;
  budget?: Partial<
    Pick<OptimizationBudget, "maxTrueForgeIterations" | "maxParallelSubAgents">
  >;
};
export type TrueForgeAnalysis = {
  usages: AiUsage[];
  candidates: Candidate[];
  before: RunMetrics;
  validation?: ValidationSnapshot;
};
export type TrueForgeRunResult = {
  mode: "trueforge" | "local-deterministic";
  sessionId?: string;
  turnId?: string;
  finalResult?: unknown;
  analysis?: TrueForgeAnalysis;
  patchFiles?: PatchFile[];
  fallbackReason?: string;
  failureReason?: string;
  retryCount?: number;
  usage?: RunMetrics;
};

async function trueForgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${trueForgeConfig.proxyPath}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok)
    throw new Error(`TrueForge ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  signal: AbortSignal | undefined,
  onRetry: (attempt: number, error: unknown) => void,
): Promise<{ value: T; retryCount: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return { value: await operation(), retryCount: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        onRetry(attempt + 1, error);
        await sleep(250 * (attempt + 1), signal);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("TrueForge request failed");
}
function mapTrueForgeEvent(
  event: TrueForgeEvent,
  onEvent: (event: AgentEvent) => void,
) {
  const id = event.thread_id ? `tf-thread-${event.thread_id}` : "tf-root";
  switch (event.type) {
    case "thread.created":
      onEvent({
        id,
        label:
          event.thread_id && event.thread_id !== "main"
            ? "TrueForge sub-agent"
            : "Optimization Orchestrator",
        status: "active",
        detail: "Sub-agent started",
      });
      break;
    case "thread.done":
      onEvent({
        id,
        label:
          event.thread_id && event.thread_id !== "main"
            ? "TrueForge sub-agent"
            : "Optimization Orchestrator",
        status: "complete",
        detail: "Sub-agent completed",
      });
      break;
    case "model.message.delta":
      onEvent({
        id: "tf-root",
        label: "Optimization Orchestrator",
        status: "active",
        detail: "Model output received",
      });
      break;
    case "action_required":
    case "tool.approval.required":
      onEvent({
        id,
        label: "TrueForge approval gate",
        status: "blocked",
        detail: "TrueForge requested an approval before continuing",
      });
      break;
    case "turn.done":
      onEvent({
        id: "tf-root",
        label: "Optimization Orchestrator",
        status: "complete",
        detail: "TrueForge turn completed",
      });
      break;
    case "turn.error":
      onEvent({
        id: "tf-root",
        label: "TrueForge turn",
        status: "blocked",
        detail: "TrueForge turn failed",
      });
      break;
  }
}
function parseEventData(data: string): TrueForgeEvent | undefined {
  try {
    const value = JSON.parse(data);
    return value && typeof value === "object"
      ? (value as TrueForgeEvent)
      : undefined;
  } catch {
    return undefined;
  }
}
function extractPatchFiles(value: unknown): PatchFile[] {
  if (!value || typeof value !== "object") return [];
  return normalizePatchPayload((value as Record<string, unknown>).files).files;
}
function isUsage(value: unknown): value is AiUsage {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as AiUsage).id === "string" &&
      typeof (value as AiUsage).file === "string" &&
      typeof (value as AiUsage).functionName === "string" &&
      typeof (value as AiUsage).provider === "string" &&
      typeof (value as AiUsage).purpose === "string" &&
      typeof (value as AiUsage).inputTokens === "number" &&
      typeof (value as AiUsage).outputTokens === "number" &&
      ["MEASURED", "ESTIMATED", "INFERRED", "NOT_VERIFIED"].includes(
        (value as AiUsage).quality,
      ),
  );
}
function isCandidate(value: unknown): value is Candidate {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Candidate).id === "string" &&
      typeof (value as Candidate).usageId === "string" &&
      typeof (value as Candidate).file === "string" &&
      typeof (value as Candidate).title === "string" &&
      typeof (value as Candidate).diff === "string" &&
      typeof (value as Candidate).savingsPercent === "number" &&
      ["HIGH", "MEDIUM", "LOW"].includes((value as Candidate).confidence),
  );
}
export function extractTrueForgeAnalysis(
  value: unknown,
): TrueForgeAnalysis | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const source = (
    record.analysis && typeof record.analysis === "object"
      ? record.analysis
      : record
  ) as Record<string, unknown>;
  const usages = Array.isArray(source.usages)
    ? source.usages.filter(isUsage)
    : [];
  const candidates = Array.isArray(source.candidates)
    ? source.candidates.filter(isCandidate)
    : [];
  const before = source.before as Partial<RunMetrics> | undefined;
  if (
    !before ||
    typeof before.calls !== "number" ||
    typeof before.tokens !== "number" ||
    typeof before.cost !== "number" ||
    typeof before.latencyMs !== "number" ||
    !["MEASURED", "ESTIMATED", "INFERRED", "NOT_VERIFIED"].includes(
      before.quality ?? "",
    )
  )
    return undefined;
  return {
    usages,
    candidates,
    before: before as RunMetrics,
    validation:
      source.validation && typeof source.validation === "object"
        ? (source.validation as ValidationSnapshot)
        : undefined,
  };
}
async function streamTurn(
  path: string,
  init: RequestInit,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<{ turnId?: string; finalResult?: unknown; usage?: RunMetrics }> {
  const started = performance.now();
  const response = await fetch(`${trueForgeConfig.proxyPath}${path}`, {
    ...init,
    signal,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok)
    throw new Error(`TrueForge ${response.status}: ${await response.text()}`);
  if (!response.body) {
    const turn = (await response.json()) as TrueForgeTurn;
    return {
      turnId: turn.id,
      usage: {
        calls: 1,
        tokens: 0,
        cost: 0,
        latencyMs: Math.round(performance.now() - started),
        quality: "NOT_VERIFIED",
      },
    };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let turnId: string | undefined;
  let finalResult: unknown;
  let turnError: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  const handleRecord = (record: string) => {
    const data = record
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data) return;
    const event = parseEventData(data);
    if (!event) {
      onEvent({
        id: "tf-root",
        label: "TrueForge stream",
        status: "blocked",
        detail: "Ignored malformed TrueForge stream event",
      });
      return;
    }
    if (event.type === "turn.created" && typeof event.id === "string")
      turnId = event.id;
    if (event.type === "turn.error")
      turnError =
        typeof event.detail === "string"
          ? event.detail
          : "TrueForge turn failed";
    const usage =
      event.usage && typeof event.usage === "object"
        ? (event.usage as Record<string, unknown>)
        : undefined;
    inputTokens +=
      typeof usage?.input_tokens === "number"
        ? usage.input_tokens
        : typeof usage?.inputTokens === "number"
          ? usage.inputTokens
          : 0;
    outputTokens +=
      typeof usage?.output_tokens === "number"
        ? usage.output_tokens
        : typeof usage?.outputTokens === "number"
          ? usage.outputTokens
          : 0;
    if (event.type === "model.message" && event.content !== undefined) {
      finalResult = event.content;
      if (typeof event.content === "string") {
        try {
          finalResult = JSON.parse(event.content);
        } catch {}
      }
    }
    mapTrueForgeEvent(event, onEvent);
  };
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const records = buffer.split(/\r?\n\r?\n/);
    buffer = records.pop() ?? "";
    for (const record of records) handleRecord(record);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleRecord(buffer);
  if (turnError) throw new Error(turnError);
  return {
    turnId,
    finalResult,
    usage: {
      calls: 1,
      tokens: inputTokens + outputTokens,
      cost: 0,
      latencyMs: Math.round(performance.now() - started),
      quality: inputTokens + outputTokens > 0 ? "MEASURED" : "NOT_VERIFIED",
    },
  };
}
export async function cancelTrueForgeSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<void> {
  await trueForgeFetch(`/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: "POST",
    signal,
  });
}
export async function getTrueForgeCapabilities() {
  return trueForgeFetch<Record<string, unknown>>("/capabilities");
}
export async function runTrueForgeOrchestrator(
  repositoryUrl: string,
  onEvent: (event: AgentEvent) => void,
  options: TrueForgeRunOptions = {},
): Promise<TrueForgeRunResult> {
  if (!trueForgeConfig.enabled) return { mode: "local-deterministic" };
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("TrueForge execution timed out")),
    options.timeoutMs ?? 120000,
  );
  const signal = options.signal;
  const abort = () =>
    controller.abort(
      signal?.reason ?? new DOMException("Aborted", "AbortError"),
    );
  signal?.addEventListener("abort", abort, { once: true });
  const task =
    options.task ??
    `Analyze ${repositoryUrl} and return structured optimization evidence.`;
  const iterationLimit = Math.max(
    1,
    Math.min(100, options.budget?.maxTrueForgeIterations ?? 20),
  );
  const maxParallelSubAgents = Math.max(
    1,
    Math.min(32, options.budget?.maxParallelSubAgents ?? 4),
  );
  onEvent({
    id: "tf-root",
    label: "Optimization Orchestrator",
    status: "active",
    detail: `Starting TrueForge analysis for ${repositoryUrl}`,
  });
  const agent = {
    spec: {
      model: { name: trueForgeConfig.model },
      instructions:
        "You are the ForgeOptimizer root orchestrator. Analyze repository evidence, never expose secrets or chain-of-thought, and request approval before external writes.",
      messages: [{ type: "user.message", content: task }],
      config: {
        iteration_limit: iterationLimit,
        dynamic_sub_agents: {
          enabled: true,
          max_parallel: maxParallelSubAgents,
        },
        context_management: {
          compaction: { enabled: true },
          large_tool_response: { enabled: true },
        },
        sandbox: { enabled: true, file_downloads: false },
      },
    },
  };
  let retryCount = 0;
  try {
    const sessionAttempt = await withRetry(
      () =>
        trueForgeFetch<TrueForgeSession>("/sessions", {
          method: "POST",
          body: JSON.stringify({ agent }),
          signal: controller.signal,
        }),
      options.maxRetries ?? 2,
      controller.signal,
      (attempt, _error) => {
        retryCount = attempt;
        onEvent({
          id: `tf-retry-${attempt}`,
          label: "TrueForge retry",
          status: "active",
          detail: `Retrying session request (attempt ${attempt + 1})`,
        });
      },
    );
    retryCount = sessionAttempt.retryCount;
    const session = sessionAttempt.value;
    onEvent({
      id: "tf-root",
      label: "Optimization Orchestrator",
      status: "active",
      detail: `TrueForge session ${session.id} opened`,
    });
    const turn = await streamTurn(
      `/sessions/${encodeURIComponent(session.id)}/turns`,
      {
        method: "POST",
        body: JSON.stringify({
          input: [{ type: "user.message", content: task }],
          stream: true,
        }),
        signal: controller.signal,
      },
      onEvent,
      controller.signal,
    );
    return {
      mode: "trueforge",
      sessionId: session.id,
      turnId: turn.turnId,
      finalResult: turn.finalResult,
      analysis: extractTrueForgeAnalysis(turn.finalResult),
      patchFiles: extractPatchFiles(turn.finalResult),
      retryCount,
      usage: turn.usage,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "TrueForge request failed";
    onEvent({
      id: "tf-root",
      label: "TrueForge failed",
      status: "blocked",
      detail: `${reason}; deterministic fallback active`,
    });
    return {
      mode: "local-deterministic",
      fallbackReason: "trueforge-unavailable",
      failureReason: reason,
      retryCount,
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
