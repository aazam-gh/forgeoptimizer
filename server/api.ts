// @ts-nocheck
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { canTransition } from "../src/runState.ts";
import {
  commitOptimizationChanges,
  createOptimizationBranch,
  createPullRequest,
  inspectCommit,
  inspectRepository,
  listRepositoryBranches,
  readRepositorySource,
} from "./github.ts";
import {
  assessValidationGate,
  approveValidationGate,
} from "../src/validation.ts";
import { buildOptimizationReport } from "../src/report.ts";
import { validateScenarios } from "../src/scenarios.ts";

const databasePath = join(process.cwd(), ".data", "forgeoptimizer.sqlite");

function openDatabase() {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      owner TEXT,
      name TEXT,
      default_branch TEXT,
      last_analyzed_commit TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_invocations (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      call_site_json TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      latency_ms INTEGER,
      cost REAL,
      cache_hit INTEGER,
      retry_count INTEGER,
      error INTEGER,
      request_fingerprint TEXT,
      capture_level TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS optimization_runs (
      id TEXT PRIMARY KEY,
      repository_url TEXT NOT NULL,
      source_branch TEXT,
      source_commit_sha TEXT,
      requests_per_day REAL,
      scenarios_json TEXT NOT NULL DEFAULT '[]',
      validation_json TEXT,
      patch_files_json TEXT,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      candidates_json TEXT NOT NULL,
      usages_json TEXT NOT NULL DEFAULT '[]',
      before_json TEXT NOT NULL DEFAULT '{}',
      approval_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      failure_reason TEXT,
      fallback_reason TEXT,
      trueforge_session_id TEXT,
      trueforge_turn_id TEXT,
      branch_json TEXT,
      pull_request_json TEXT
      ,baseline_json TEXT
      ,evaluations_json TEXT
      ,after_json TEXT
      ,projection_json TEXT
      ,optimizer_usage_json TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES optimization_runs(id)
    );
  `);
  try {
    database.exec("ALTER TABLE optimization_runs ADD COLUMN plan_json TEXT");
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN source_branch TEXT",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN source_commit_sha TEXT",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN requests_per_day REAL",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN scenarios_json TEXT NOT NULL DEFAULT '[]'",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN validation_json TEXT",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN patch_files_json TEXT",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN usages_json TEXT NOT NULL DEFAULT '[]'",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN before_json TEXT NOT NULL DEFAULT '{}'",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending'",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec("ALTER TABLE optimization_runs ADD COLUMN branch_json TEXT");
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN pull_request_json TEXT",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN baseline_json TEXT",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN evaluations_json TEXT",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec("ALTER TABLE optimization_runs ADD COLUMN after_json TEXT");
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN projection_json TEXT",
    );
  } catch {
    /* already migrated */
  }
  try {
    database.exec(
      "ALTER TABLE optimization_runs ADD COLUMN optimizer_usage_json TEXT",
    );
  } catch {
    /* already migrated */
  }
  return database;
}

function json(response, status, value) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function runRecord(database, id) {
  const run = database
    .prepare("SELECT * FROM optimization_runs WHERE id = ?")
    .get(id);
  if (!run) return null;
  const events = database
    .prepare(
      "SELECT id, label, status, detail, created_at AS createdAt FROM agent_events WHERE run_id = ? ORDER BY created_at",
    )
    .all(id);
  const optimizerUsage = run.optimizer_usage_json
    ? JSON.parse(run.optimizer_usage_json)
    : undefined;
  return {
    id: run.id,
    repositoryUrl: run.repository_url,
    sourceBranch: run.source_branch ?? undefined,
    sourceCommitSha: run.source_commit_sha ?? undefined,
    requestsPerDay: run.requests_per_day ?? undefined,
    scenarios: JSON.parse(run.scenarios_json ?? "[]"),
    patchFiles: run.patch_files_json
      ? JSON.parse(run.patch_files_json)
      : undefined,
    validation: run.validation_json
      ? JSON.parse(run.validation_json)
      : undefined,
    status: run.status,
    mode: run.mode,
    approvalStatus: run.approval_status,
    policy: JSON.parse(run.policy_json),
    plan: run.plan_json ? JSON.parse(run.plan_json) : undefined,
    branch: run.branch_json ? JSON.parse(run.branch_json) : undefined,
    pullRequest: run.pull_request_json
      ? JSON.parse(run.pull_request_json)
      : undefined,
    baseline: run.baseline_json ? JSON.parse(run.baseline_json) : undefined,
    evaluations: run.evaluations_json
      ? JSON.parse(run.evaluations_json)
      : undefined,
    after: run.after_json ? JSON.parse(run.after_json) : undefined,
    projection: run.projection_json
      ? JSON.parse(run.projection_json)
      : undefined,
    optimizerUsage,
    optimizerCost: optimizerUsage?.cost,
    candidates: JSON.parse(run.candidates_json),
    usages: JSON.parse(run.usages_json),
    before: JSON.parse(run.before_json),
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    failureReason: run.failure_reason ?? undefined,
    fallbackReason: run.fallback_reason ?? undefined,
    trueForgeSessionId: run.trueforge_session_id ?? undefined,
    trueForgeTurnId: run.trueforge_turn_id ?? undefined,
    events,
  };
}

function runRecords(database) {
  return database
    .prepare(
      "SELECT id FROM optimization_runs ORDER BY updated_at DESC LIMIT 100",
    )
    .all()
    .map((row) => runRecord(database, row.id));
}

function createRun(database, input) {
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  if (
    input.id &&
    database
      .prepare("SELECT id FROM optimization_runs WHERE id = ?")
      .get(input.id)
  )
    return runRecord(database, input.id);
  const scenarioErrors = validateScenarios(input.scenarios ?? []);
  if (scenarioErrors.length)
    throw new Error(`Invalid scenarios: ${scenarioErrors.join("; ")}`);
  const repositoryUrl = input.repositoryUrl ?? "fixture://inefficient-ai-app";
  let owner = null;
  let name = null;
  try {
    const parsed = new URL(repositoryUrl);
    if (parsed.hostname === "github.com") {
      [owner, name] = parsed.pathname.split("/").filter(Boolean);
      name = name?.replace(/\.git$/, "") ?? null;
    }
  } catch {
    /* fixture URLs have no repository identity */
  }
  database
    .prepare(
      "INSERT INTO repositories (id, url, owner, name, default_branch, last_analyzed_commit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET default_branch = excluded.default_branch, last_analyzed_commit = excluded.last_analyzed_commit, updated_at = excluded.updated_at",
    )
    .run(
      randomUUID(),
      repositoryUrl,
      owner,
      name,
      input.sourceBranch ?? null,
      input.sourceCommitSha ?? null,
      now,
      now,
    );
  database
    .prepare(
      "INSERT INTO optimization_runs (id, repository_url, source_branch, source_commit_sha, requests_per_day, scenarios_json, status, mode, policy_json, candidates_json, usages_json, before_json, approval_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      repositoryUrl,
      input.sourceBranch ?? null,
      input.sourceCommitSha ?? null,
      input.requestsPerDay ?? null,
      JSON.stringify(input.scenarios ?? []),
      "created",
      input.mode ?? "local-deterministic",
      JSON.stringify(input.policy ?? {}),
      JSON.stringify(input.candidates ?? []),
      JSON.stringify(input.usages ?? []),
      JSON.stringify(input.before ?? {}),
      "pending",
      now,
      now,
    );
  for (const invocation of input.usages ?? [])
    appendInvocation(database, id, invocation);
  return runRecord(database, id);
}

function appendEvent(database, runId, event) {
  database
    .prepare(
      "INSERT OR REPLACE INTO agent_events (id, run_id, label, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      event.id ?? randomUUID(),
      runId,
      event.label,
      event.status,
      event.detail,
      new Date().toISOString(),
    );
}

function appendInvocation(database, runId, invocation) {
  database
    .prepare(
      "INSERT OR REPLACE INTO ai_invocations (id, run_id, provider, model, call_site_json, input_tokens, output_tokens, latency_ms, cost, cache_hit, retry_count, error, request_fingerprint, capture_level, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      invocation.id ?? randomUUID(),
      runId,
      invocation.provider,
      invocation.model ?? null,
      JSON.stringify(invocation.callSite ?? {}),
      invocation.inputTokens ?? null,
      invocation.outputTokens ?? null,
      invocation.latencyMs ?? null,
      invocation.cost ?? null,
      invocation.cacheHit ? 1 : 0,
      invocation.retryCount ?? null,
      invocation.error ? 1 : 0,
      invocation.requestFingerprint ?? null,
      invocation.captureLevel,
      JSON.stringify(invocation.metadata ?? {}),
      new Date().toISOString(),
    );
}

function invocationRecords(database, runId) {
  return database
    .prepare(
      "SELECT id, provider, model, call_site_json AS callSite, input_tokens AS inputTokens, output_tokens AS outputTokens, latency_ms AS latencyMs, cost, cache_hit AS cacheHit, retry_count AS retryCount, error, request_fingerprint AS requestFingerprint, capture_level AS captureLevel, metadata_json AS metadata, created_at AS createdAt FROM ai_invocations WHERE run_id = ? ORDER BY created_at",
    )
    .all(runId)
    .map((invocation) => ({
      ...invocation,
      callSite: JSON.parse(invocation.callSite),
      metadata: JSON.parse(invocation.metadata),
      cacheHit: Boolean(invocation.cacheHit),
      error: Boolean(invocation.error),
    }));
}

function streamEvents(response, database, runId) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  const sent = new Set();
  const flush = () => {
    const run = runRecord(database, runId);
    if (!run) {
      response.end();
      return;
    }
    for (const event of run.events) {
      if (sent.has(event.id)) continue;
      sent.add(event.id);
      response.write(`event: agent\ndata: ${JSON.stringify(event)}\n\n`);
    }
    response.write(": keep-alive\n\n");
    if (["completed", "failed", "cancelled"].includes(run.status))
      response.end();
  };
  flush();
  const interval = setInterval(flush, 1000);
  response.on("close", () => clearInterval(interval));
}

function updateRun(database, id, patch) {
  const current = database
    .prepare("SELECT * FROM optimization_runs WHERE id = ?")
    .get(id);
  if (!current) return null;
  if (patch.status && !canTransition(current.status, patch.status))
    throw new Error(
      `Invalid run transition: ${current.status} -> ${patch.status}`,
    );
  const next = {
    status: patch.status ?? current.status,
    mode: patch.mode ?? current.mode,
    failureReason: patch.failureReason ?? current.failure_reason,
    fallbackReason: patch.fallbackReason ?? current.fallback_reason,
    trueForgeSessionId:
      patch.trueForgeSessionId ?? current.trueforge_session_id,
    trueForgeTurnId: patch.trueForgeTurnId ?? current.trueforge_turn_id,
  };
  database
    .prepare(
      "UPDATE optimization_runs SET status = ?, mode = ?, approval_status = ?, updated_at = ?, failure_reason = ?, fallback_reason = ?, trueforge_session_id = ?, trueforge_turn_id = ? WHERE id = ?",
    )
    .run(
      next.status,
      next.mode,
      patch.approvalStatus ?? current.approval_status,
      new Date().toISOString(),
      next.failureReason ?? null,
      next.fallbackReason ?? null,
      next.trueForgeSessionId ?? null,
      next.trueForgeTurnId ?? null,
      id,
    );
  if (patch.status && patch.status !== current.status)
    appendEvent(database, id, {
      id: `run-${id}-${patch.status}`,
      label: "Run lifecycle",
      status:
        patch.status === "failed" || patch.status === "cancelled"
          ? "blocked"
          : "complete",
      detail: `Run transitioned to ${patch.status}`,
    });
  return runRecord(database, id);
}
function respondWithUpdatedRun(response, database, id, patch) {
  const updated = updateRun(database, id, patch);
  return updated
    ? json(response, 200, updated)
    : json(response, 404, { error: "Run not found" });
}
function authorizeGithubInspection(request, response) {
  const configured = process.env.FORGEOPTIMIZER_API_TOKEN;
  if (configured) {
    const authorization = request.headers.authorization ?? "";
    if (authorization !== `Bearer ${configured}`) {
      json(response, 401, {
        error: "ForgeOptimizer authorization is required",
      });
      return false;
    }
  } else if (process.env.NODE_ENV === "production") {
    json(response, 503, {
      error: "FORGEOPTIMIZER_API_TOKEN must be configured",
    });
    return false;
  }
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin && host && !origin.endsWith(`://${host}`)) {
    json(response, 403, { error: "Cross-origin GitHub access is not allowed" });
    return false;
  }
  return true;
}

function updateCandidates(database, candidateId, accepted) {
  const runs = database
    .prepare("SELECT id, candidates_json FROM optimization_runs")
    .all();
  for (const run of runs) {
    const candidates = JSON.parse(run.candidates_json);
    const index = candidates.findIndex(
      (candidate) => candidate.id === candidateId,
    );
    if (index === -1) continue;
    candidates[index] = { ...candidates[index], accepted };
    database
      .prepare(
        "UPDATE optimization_runs SET candidates_json = ?, updated_at = ? WHERE id = ?",
      )
      .run(JSON.stringify(candidates), new Date().toISOString(), run.id);
    return runRecord(database, run.id);
  }
  return null;
}

function findCandidate(database, candidateId) {
  const runs = database
    .prepare("SELECT id, candidates_json FROM optimization_runs")
    .all();
  for (const run of runs) {
    const candidate = JSON.parse(run.candidates_json).find(
      (candidate) => candidate.id === candidateId,
    );
    if (candidate) return { runId: run.id, candidate };
  }
  return null;
}

function proxyTarget(config) {
  return (
    config.trueForgeUrl ??
    process.env.VITE_TRUEFORGE_URL ??
    "http://localhost:8790"
  );
}

async function proxyTrueForge(request, response, config) {
  const target = `${proxyTarget(config).replace(/\/$/, "")}${(request.url ?? "/api/trueforge").replace(/^\/api\/trueforge/, "/api/v1")}`;
  const body = ["GET", "HEAD"].includes(request.method ?? "GET")
    ? undefined
    : JSON.stringify(await readBody(request));
  const upstream = await fetch(target, {
    method: request.method,
    body,
    headers: {
      "Content-Type": "application/json",
      ...(config.trueForgeApiKey
        ? { Authorization: `Bearer ${config.trueForgeApiKey}` }
        : {}),
    },
  });
  response.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (["content-length", "connection", "transfer-encoding"].includes(key))
      return;
    response.setHeader(key, value);
  });
  if (!upstream.body) {
    response.end(await upstream.text());
    return;
  }
  const reader = upstream.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    response.write(Buffer.from(chunk.value));
  }
  response.end();
}

function apiPlugin(config = {}) {
  const database = openDatabase();
  return {
    name: "forgeoptimizer-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        await handleRequest(request, response, next, database, config);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (request, response, next) => {
        await handleRequest(request, response, next, database, config);
      });
    },
  };
}

async function handleBoundGithubRequest(request, response, database, pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length !== 4 ||
    segments[0] !== "api" ||
    segments[1] !== "runs" ||
    !["github-commit", "github-pr"].includes(segments[3]) ||
    request.method !== "POST"
  )
    return false;
  const id = segments[2];
  const run = runRecord(database, id);
  if (!run) {
    json(response, 404, { error: "Run not found" });
    return true;
  }
  if (run.approvalStatus !== "approved") {
    json(response, 409, {
      error: "Explicit approval is required before external GitHub writes",
    });
    return true;
  }
  if (!run.branch) {
    json(response, 409, {
      error: "The approved run has no optimization branch",
    });
    return true;
  }
  const body = await readBody(request);
  if (segments[3] === "github-commit") {
    if (!Array.isArray(run.patchFiles) || run.patchFiles.length === 0) {
      json(response, 409, {
        error: "The approved run has no persisted patch files",
      });
      return true;
    }
    const commit = await commitOptimizationChanges(
      run.repositoryUrl,
      run.branch.optimizationBranch,
      run.patchFiles,
      body.message,
    );
    const branch = { ...run.branch, resultingCommitSha: commit.commitSha };
    database
      .prepare(
        "UPDATE optimization_runs SET branch_json = ?, updated_at = ? WHERE id = ?",
      )
      .run(JSON.stringify(branch), new Date().toISOString(), id);
    json(response, 201, { ...runRecord(database, id), commit });
    return true;
  }
  if (!run.branch.resultingCommitSha) {
    json(response, 409, {
      error:
        "A resulting optimization commit is required before creating a pull request",
    });
    return true;
  }
  const pullRequest = await createPullRequest(
    run.repositoryUrl,
    run.branch.optimizationBranch,
    run.branch.baseBranch,
    body.title,
    body.body,
  );
  database
    .prepare(
      "UPDATE optimization_runs SET pull_request_json = ?, updated_at = ? WHERE id = ?",
    )
    .run(
      JSON.stringify({
        number: pullRequest.number,
        url: pullRequest.url,
        title: pullRequest.title,
        status: "created",
        branch: run.branch,
      }),
      new Date().toISOString(),
      id,
    );
  json(response, 201, runRecord(database, id));
  return true;
}

async function handleRequest(request, response, next, database, config = {}) {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname.startsWith("/api/trueforge"))
    return proxyTrueForge(request, response, config);
  if (await handleBoundGithubRequest(request, response, database, pathname))
    return;
  if (
    !pathname.startsWith("/api/runs") &&
    !pathname.startsWith("/api/candidates") &&
    !pathname.startsWith("/api/github") &&
    !pathname.startsWith("/api/repositories")
  )
    return next();
  try {
    const segments = pathname.split("/").filter(Boolean);
    if (request.method === "GET" && pathname === "/api/repositories/history") {
      const repositoryUrl = new URL(
        request.url ?? "/",
        "http://localhost",
      ).searchParams.get("repositoryUrl");
      if (!repositoryUrl)
        return json(response, 400, { error: "repositoryUrl is required" });
      const runs = runRecords(database).filter(
        (run) => run.repositoryUrl === repositoryUrl,
      );
      const latest = runs[0];
      const currentBefore = latest?.before?.cost ?? 0;
      const currentCalls = latest?.before?.calls ?? 0;
      const savingsDiscovered = runs.reduce(
        (sum, run) =>
          sum +
          Math.max(
            0,
            (run.before?.cost ?? 0) -
              (run.after?.cost ?? run.before?.cost ?? 0),
          ),
        0,
      );
      return json(response, 200, {
        repositoryUrl,
        aiSpend: currentBefore,
        aiCalls: currentCalls,
        savingsDiscovered,
        latestOptimizedCommit: latest?.branch?.resultingCommitSha,
        runs,
      });
    }
    if (request.method === "GET" && pathname === "/api/repositories") {
      const repositories = database
        .prepare(
          "SELECT id, url, owner, name, default_branch AS defaultBranch, last_analyzed_commit AS lastAnalyzedCommit, created_at AS createdAt, updated_at AS updatedAt FROM repositories ORDER BY updated_at DESC",
        )
        .all();
      return json(response, 200, repositories);
    }
    if (request.method === "POST" && pathname === "/api/github/repository") {
      if (!authorizeGithubInspection(request, response)) return;
      const body = await readBody(request);
      return json(
        response,
        200,
        await inspectRepository(body.repositoryUrl, body.branch),
      );
    }
    if (request.method === "POST" && pathname === "/api/github/branches") {
      if (!authorizeGithubInspection(request, response)) return;
      const body = await readBody(request);
      return json(response, 200, {
        branches: await listRepositoryBranches(body.repositoryUrl),
      });
    }
    if (request.method === "POST" && pathname === "/api/github/commit") {
      if (!authorizeGithubInspection(request, response)) return;
      const body = await readBody(request);
      return json(
        response,
        200,
        await inspectCommit(body.repositoryUrl, body.commitSha),
      );
    }
    if (request.method === "POST" && pathname === "/api/github/source") {
      if (!authorizeGithubInspection(request, response)) return;
      const body = await readBody(request);
      return json(response, 200, {
        files: await readRepositorySource(
          body.repositoryUrl,
          body.branch,
          Math.min(200, Math.max(1, Number(body.maxFiles) || 200)),
        ),
      });
    }
    if (request.method === "POST" && pathname === "/api/github/branch")
      return json(response, 409, {
        error:
          "Run-scoped approval is required before creating an optimization branch",
      });
    if (request.method === "POST" && pathname === "/api/github/pull-request")
      return json(response, 409, {
        error: "Run-scoped approval is required before creating a pull request",
      });
    if (segments[1] === "candidates") {
      const candidateRecord = findCandidate(database, segments[2]);
      if (!candidateRecord)
        return json(response, 404, { error: "Candidate not found" });
      if (request.method === "GET" && segments[3] === "diff")
        return json(response, 200, {
          candidate: candidateRecord.candidate.id,
          runId: candidateRecord.runId,
          diff: candidateRecord.candidate.diff ?? "",
        });
      if (request.method === "POST" && segments[3] === "execute") {
        appendEvent(database, candidateRecord.runId, {
          id: `candidate-${candidateRecord.candidate.id}-execute`,
          label: "Candidate execution",
          status: "active",
          detail: `Execution requested for ${candidateRecord.candidate.title}`,
        });
        return json(response, 202, {
          runId: candidateRecord.runId,
          candidate: candidateRecord.candidate,
          status: "queued",
        });
      }
    }
    if (request.method === "POST" && segments.length === 2)
      return json(response, 201, createRun(database, await readBody(request)));
    if (request.method === "GET" && segments.length === 2)
      return json(response, 200, runRecords(database));
    const id = segments[2];
    if (!id) return json(response, 400, { error: "Run ID is required" });
    if (request.method === "POST" && segments[3] === "github-commit") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      if (run.approvalStatus !== "approved")
        return json(response, 409, {
          error:
            "Explicit approval is required before committing optimization changes",
        });
      if (!run.branch)
        return json(response, 409, {
          error: "Optimization branch must be created first",
        });
      const body = await readBody(request);
      const commit = await commitOptimizationChanges(
        body.repositoryUrl ?? run.repositoryUrl,
        run.branch.optimizationBranch,
        body.files,
        body.message,
      );
      const branch = { ...run.branch, resultingCommitSha: commit.commitSha };
      database
        .prepare(
          "UPDATE optimization_runs SET branch_json = ?, updated_at = ? WHERE id = ?",
        )
        .run(JSON.stringify(branch), new Date().toISOString(), id);
      return json(response, 201, { ...runRecord(database, id), commit });
    }
    if (request.method === "GET" && segments.length === 3) {
      const run = runRecord(database, id);
      return run
        ? json(response, 200, run)
        : json(response, 404, { error: "Run not found" });
    }
    if (request.method === "GET" && segments[3] === "candidates") {
      const run = runRecord(database, id);
      return run
        ? json(response, 200, { candidates: run.candidates })
        : json(response, 404, { error: "Run not found" });
    }
    if (request.method === "GET" && segments[3] === "invocations") {
      const run = runRecord(database, id);
      return run
        ? json(response, 200, { invocations: invocationRecords(database, id) })
        : json(response, 404, { error: "Run not found" });
    }
    if (request.method === "POST" && segments[3] === "invocations") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      const body = await readBody(request);
      if (!body.id || !body.provider || !body.captureLevel)
        return json(response, 400, {
          error: "Invocation id, provider, and capture level are required",
        });
      appendInvocation(database, id, body);
      return json(response, 201, {
        invocation: invocationRecords(database, id).find(
          (invocation) => invocation.id === body.id,
        ),
      });
    }
    if (request.method === "GET" && segments[3] === "results") {
      const run = runRecord(database, id);
      return run
        ? json(response, 200, {
            ...run,
            reportReady: Boolean(
              run.after || run.baseline || run.evaluations || run.plan,
            ),
          })
        : json(response, 404, { error: "Run not found" });
    }
    if (request.method === "POST" && segments[3] === "results") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      const body = await readBody(request);
      if (!body.after)
        return json(response, 400, { error: "After metrics are required" });
      database
        .prepare(
          "UPDATE optimization_runs SET after_json = ?, projection_json = COALESCE(?, projection_json), validation_json = COALESCE(?, validation_json), patch_files_json = COALESCE(?, patch_files_json), optimizer_usage_json = COALESCE(?, optimizer_usage_json), updated_at = ? WHERE id = ?",
        )
        .run(
          JSON.stringify(body.after),
          body.projection !== undefined
            ? JSON.stringify(body.projection)
            : null,
          body.validationEvidence !== undefined
            ? JSON.stringify(assessValidationGate(body.validationEvidence))
            : body.validation !== undefined &&
                body.validation &&
                typeof body.validation === "object" &&
                ["PASS", "FAIL", "NOT_VERIFIED"].includes(
                  body.validation.state,
                ) &&
                typeof body.validation.canPublish === "boolean" &&
                body.validation.checks &&
                typeof body.validation.checks === "object" &&
                Array.isArray(body.validation.reasons)
              ? JSON.stringify({
                  state: body.validation.state,
                  canPublish: body.validation.canPublish,
                  checks: body.validation.checks,
                  reasons: body.validation.reasons,
                })
              : null,
          body.patchFiles !== undefined
            ? JSON.stringify(body.patchFiles)
            : null,
          body.optimizerUsage !== undefined
            ? JSON.stringify(body.optimizerUsage)
            : null,
          new Date().toISOString(),
          id,
        );
      return json(response, 200, runRecord(database, id));
    }
    if (request.method === "POST" && segments[3] === "scenarios") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      const body = await readBody(request);
      if (!Array.isArray(body.scenarios))
        return json(response, 400, { error: "Scenarios must be an array" });
      const errors = validateScenarios(body.scenarios);
      if (errors.length)
        return json(response, 400, { error: "Invalid scenarios", errors });
      database
        .prepare(
          "UPDATE optimization_runs SET scenarios_json = ?, updated_at = ? WHERE id = ?",
        )
        .run(JSON.stringify(body.scenarios), new Date().toISOString(), id);
      return json(response, 200, runRecord(database, id));
    }
    if (request.method === "GET" && segments[3] === "events") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      streamEvents(response, database, id);
      return;
    }
    if (request.method === "POST" && segments[3] === "events") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      const event = await readBody(request);
      if (!event.id || !event.label || !event.status || !event.detail)
        return json(response, 400, {
          error: "Event id, label, status, and detail are required",
        });
      appendEvent(database, id, event);
      return json(response, 201, runRecord(database, id));
    }
    if (request.method === "POST" && segments[3] === "state") {
      const body = await readBody(request);
      if (!body.status)
        return json(response, 400, { error: "Run status is required" });
      return respondWithUpdatedRun(response, database, id, body);
    }
    if (request.method === "POST" && segments[3] === "start")
      return respondWithUpdatedRun(response, database, id, {
        status: "preparing",
      });
    if (request.method === "POST" && segments[3] === "cancel")
      return respondWithUpdatedRun(response, database, id, {
        status: "cancelled",
      });
    if (request.method === "POST" && segments[3] === "complete")
      return respondWithUpdatedRun(response, database, id, {
        status: "completed",
      });
    if (request.method === "POST" && segments[3] === "approve") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      if (!run.validation)
        return json(response, 409, {
          error: "Validation gate is not complete",
        });
      const validation = approveValidationGate(run.validation);
      if (!validation.canPublish)
        return json(response, 409, {
          error: "Validation gate is not complete",
          validation,
        });
      database
        .prepare(
          "UPDATE optimization_runs SET validation_json = ?, updated_at = ? WHERE id = ?",
        )
        .run(JSON.stringify(validation), new Date().toISOString(), id);
      return json(
        response,
        200,
        updateRun(database, id, { approvalStatus: "approved" }),
      );
    }
    if (request.method === "POST" && segments[3] === "github-branch") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      if (run.approvalStatus !== "approved")
        return json(response, 409, {
          error:
            "Explicit approval is required before creating an optimization branch",
        });
      const body = await readBody(request);
      const baseBranch = run.branch?.baseBranch ?? body.baseBranch;
      const branch = await createOptimizationBranch(
        run.repositoryUrl,
        baseBranch,
        body.branchName,
        run.branch?.baseCommitSha ?? run.sourceCommitSha,
      );
      database
        .prepare(
          "UPDATE optimization_runs SET source_branch = ?, source_commit_sha = ?, branch_json = ?, updated_at = ? WHERE id = ?",
        )
        .run(
          baseBranch,
          branch.baseCommitSha,
          JSON.stringify({
            baseBranch,
            baseCommitSha: branch.baseCommitSha,
            optimizationBranch: branch.branchName,
          }),
          new Date().toISOString(),
          id,
        );
      return json(response, 201, runRecord(database, id));
    }
    if (request.method === "POST" && segments[3] === "github-pr") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      if (run.approvalStatus !== "approved")
        return json(response, 409, {
          error: "Explicit approval is required before creating a pull request",
        });
      if (!run.branch?.resultingCommitSha)
        return json(response, 409, {
          error:
            "A resulting optimization commit is required before creating a pull request",
        });
      const body = await readBody(request);
      if (body.approved !== true)
        return json(response, 409, {
          error: "Explicit approval is required before creating a pull request",
        });
      const pullRequest = await createPullRequest(
        run.repositoryUrl,
        run.branch.optimizationBranch,
        run.branch.baseBranch,
        body.title,
        body.body,
      );
      database
        .prepare(
          "UPDATE optimization_runs SET pull_request_json = ?, updated_at = ? WHERE id = ?",
        )
        .run(
          JSON.stringify({
            number: pullRequest.number,
            url: pullRequest.url,
            title: pullRequest.title,
            status: "created",
            branch: run.branch,
          }),
          new Date().toISOString(),
          id,
        );
      return json(response, 201, runRecord(database, id));
    }
    if (request.method === "POST" && segments[3] === "plan") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      const body = await readBody(request);
      database
        .prepare(
          "UPDATE optimization_runs SET plan_json = ?, updated_at = ? WHERE id = ?",
        )
        .run(JSON.stringify(body), new Date().toISOString(), id);
      return json(response, 200, { ...run, plan: body });
    }
    if (request.method === "POST" && segments[3] === "baseline") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      const body = await readBody(request);
      database
        .prepare(
          "UPDATE optimization_runs SET baseline_json = ?, updated_at = ? WHERE id = ?",
        )
        .run(JSON.stringify(body), new Date().toISOString(), id);
      return json(response, 200, runRecord(database, id));
    }
    if (request.method === "POST" && segments[3] === "evaluations") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      const body = await readBody(request);
      if (!Array.isArray(body))
        return json(response, 400, { error: "Evaluations must be an array" });
      database
        .prepare(
          "UPDATE optimization_runs SET evaluations_json = ?, updated_at = ? WHERE id = ?",
        )
        .run(JSON.stringify(body), new Date().toISOString(), id);
      return json(response, 200, runRecord(database, id));
    }
    if (request.method === "POST" && segments[3] === "publish") {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: "Run not found" });
      if (run.approvalStatus !== "approved")
        return json(response, 409, {
          error: "Explicit approval is required before publishing",
        });
      return json(
        response,
        200,
        updateRun(database, id, { status: "publishing" }),
      );
    }
    if (
      request.method === "POST" &&
      segments[1] === "candidates" &&
      segments[3] &&
      ["approve", "reject"].includes(segments[3])
    ) {
      const run = updateCandidates(
        database,
        segments[2],
        segments[3] === "approve",
      );
      return run
        ? json(response, 200, run)
        : json(response, 404, { error: "Candidate not found" });
    }
    return json(response, 404, { error: "Unsupported run endpoint" });
  } catch (error) {
    return json(response, 400, {
      error: error instanceof Error ? error.message : "Invalid request",
    });
  }
}

export { apiPlugin };
