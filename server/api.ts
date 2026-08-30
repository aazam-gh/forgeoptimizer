// @ts-nocheck
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { canTransition } from '../src/runState.ts';
import { createOptimizationBranch, createPullRequest, inspectRepository } from './github.ts';
import { assessValidationGate } from '../src/validation.ts';
import { buildOptimizationReport } from '../src/report.ts';

const databasePath = join(process.cwd(), '.data', 'forgeoptimizer.sqlite');

function openDatabase() {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS optimization_runs (
      id TEXT PRIMARY KEY,
      repository_url TEXT NOT NULL,
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
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN plan_json TEXT'); } catch { /* already migrated */ }
  try { database.exec("ALTER TABLE optimization_runs ADD COLUMN usages_json TEXT NOT NULL DEFAULT '[]'"); } catch { /* already migrated */ }
  try { database.exec("ALTER TABLE optimization_runs ADD COLUMN before_json TEXT NOT NULL DEFAULT '{}'"); } catch { /* already migrated */ }
  try { database.exec("ALTER TABLE optimization_runs ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending'"); } catch { /* already migrated */ }
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN branch_json TEXT'); } catch { /* already migrated */ }
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN pull_request_json TEXT'); } catch { /* already migrated */ }
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN baseline_json TEXT'); } catch { /* already migrated */ }
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN evaluations_json TEXT'); } catch { /* already migrated */ }
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN after_json TEXT'); } catch { /* already migrated */ }
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN projection_json TEXT'); } catch { /* already migrated */ }
  return database;
}

function json(response, status, value) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); } });
    request.on('error', reject);
  });
}

function runRecord(database, id) {
  const run = database.prepare('SELECT * FROM optimization_runs WHERE id = ?').get(id);
  if (!run) return null;
  const events = database.prepare('SELECT id, label, status, detail, created_at AS createdAt FROM agent_events WHERE run_id = ? ORDER BY created_at').all(id);
  return { id: run.id, repositoryUrl: run.repository_url, status: run.status, mode: run.mode, approvalStatus: run.approval_status, policy: JSON.parse(run.policy_json), plan: run.plan_json ? JSON.parse(run.plan_json) : undefined, branch: run.branch_json ? JSON.parse(run.branch_json) : undefined, pullRequest: run.pull_request_json ? JSON.parse(run.pull_request_json) : undefined, baseline: run.baseline_json ? JSON.parse(run.baseline_json) : undefined, evaluations: run.evaluations_json ? JSON.parse(run.evaluations_json) : undefined, after: run.after_json ? JSON.parse(run.after_json) : undefined, projection: run.projection_json ? JSON.parse(run.projection_json) : undefined, candidates: JSON.parse(run.candidates_json), usages: JSON.parse(run.usages_json), before: JSON.parse(run.before_json), createdAt: run.created_at, updatedAt: run.updated_at, failureReason: run.failure_reason ?? undefined, fallbackReason: run.fallback_reason ?? undefined, trueForgeSessionId: run.trueforge_session_id ?? undefined, trueForgeTurnId: run.trueforge_turn_id ?? undefined, events };
}

function runRecords(database) {
  return database.prepare('SELECT id FROM optimization_runs ORDER BY updated_at DESC LIMIT 100').all().map(row => runRecord(database, row.id));
}

function createRun(database, input) {
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  database.prepare('INSERT INTO optimization_runs (id, repository_url, status, mode, policy_json, candidates_json, usages_json, before_json, approval_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.repositoryUrl ?? 'fixture://inefficient-ai-app', 'created', input.mode ?? 'local-deterministic', JSON.stringify(input.policy ?? {}), JSON.stringify(input.candidates ?? []), JSON.stringify(input.usages ?? []), JSON.stringify(input.before ?? {}), input.approvalStatus ?? 'pending', now, now);
  return runRecord(database, id);
}

function appendEvent(database, runId, event) {
  database.prepare('INSERT OR REPLACE INTO agent_events (id, run_id, label, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(event.id ?? randomUUID(), runId, event.label, event.status, event.detail, new Date().toISOString());
}

function updateRun(database, id, patch) {
  const current = database.prepare('SELECT * FROM optimization_runs WHERE id = ?').get(id);
  if (!current) return null;
  if (patch.status && !canTransition(current.status, patch.status)) throw new Error(`Invalid run transition: ${current.status} -> ${patch.status}`);
  const next = { status: patch.status ?? current.status, mode: patch.mode ?? current.mode, failureReason: patch.failureReason ?? current.failure_reason, fallbackReason: patch.fallbackReason ?? current.fallback_reason, trueForgeSessionId: patch.trueForgeSessionId ?? current.trueforge_session_id, trueForgeTurnId: patch.trueForgeTurnId ?? current.trueforge_turn_id };
  database.prepare('UPDATE optimization_runs SET status = ?, mode = ?, approval_status = ?, updated_at = ?, failure_reason = ?, fallback_reason = ?, trueforge_session_id = ?, trueforge_turn_id = ? WHERE id = ?').run(next.status, next.mode, patch.approvalStatus ?? current.approval_status, new Date().toISOString(), next.failureReason ?? null, next.fallbackReason ?? null, next.trueForgeSessionId ?? null, next.trueForgeTurnId ?? null, id);
  if (patch.status && patch.status !== current.status) appendEvent(database, id, { id: `run-${id}-${patch.status}`, label: 'Run lifecycle', status: patch.status === 'failed' || patch.status === 'cancelled' ? 'blocked' : 'complete', detail: `Run transitioned to ${patch.status}` });
  return runRecord(database, id);
}

function updateCandidates(database, candidateId, accepted) {
  const runs = database.prepare('SELECT id, candidates_json FROM optimization_runs').all();
  for (const run of runs) {
    const candidates = JSON.parse(run.candidates_json);
    const index = candidates.findIndex(candidate => candidate.id === candidateId);
    if (index === -1) continue;
    candidates[index] = { ...candidates[index], accepted };
    database.prepare('UPDATE optimization_runs SET candidates_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(candidates), new Date().toISOString(), run.id);
    return runRecord(database, run.id);
  }
  return null;
}

function apiPlugin() {
  const database = openDatabase();
  return {
    name: 'forgeoptimizer-api',
    configureServer(server) { server.middlewares.use(async (request, response, next) => { await handleRequest(request, response, next, database); }); },
    configurePreviewServer(server) { server.middlewares.use(async (request, response, next) => { await handleRequest(request, response, next, database); }); },
  };
}

async function handleRequest(request, response, next, database) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (!pathname.startsWith('/api/runs') && !pathname.startsWith('/api/candidates') && !pathname.startsWith('/api/github')) return next();
  try {
    const segments = pathname.split('/').filter(Boolean);
    if (request.method === 'POST' && pathname === '/api/github/repository') { const body = await readBody(request); return json(response, 200, await inspectRepository(body.repositoryUrl, body.branch)); }
    if (request.method === 'POST' && pathname === '/api/github/branch') { const body = await readBody(request); return json(response, 201, await createOptimizationBranch(body.repositoryUrl, body.baseBranch, body.branchName)); }
    if (request.method === 'POST' && pathname === '/api/github/pull-request') { const body = await readBody(request); if (body.approved !== true) return json(response, 409, { error: 'Explicit approval is required before creating a pull request' }); if (!body.validation) return json(response, 409, { error: 'Validation gate is not complete' }); const validation = assessValidationGate(body.validation); if (!validation.canPublish) return json(response, 409, { error: 'Validation gate is not complete', validation }); const reportBody = body.body ?? (body.report ? buildOptimizationReport({ ...body.report, validation }) : undefined); if (!reportBody) return json(response, 400, { error: 'Evidence-backed report body is required' }); return json(response, 201, await createPullRequest(body.repositoryUrl, body.head, body.base, body.title, reportBody)); }
    if (request.method === 'POST' && segments.length === 2) return json(response, 201, createRun(database, await readBody(request)));
    if (request.method === 'GET' && segments.length === 2) return json(response, 200, runRecords(database));
    const id = segments[2];
    if (!id) return json(response, 400, { error: 'Run ID is required' });
    if (request.method === 'GET' && segments.length === 3) { const run = runRecord(database, id); return run ? json(response, 200, run) : json(response, 404, { error: 'Run not found' }); }
    if (request.method === 'GET' && segments[3] === 'candidates') { const run = runRecord(database, id); return run ? json(response, 200, { candidates: run.candidates }) : json(response, 404, { error: 'Run not found' }); }
    if (request.method === 'GET' && segments[3] === 'results') { const run = runRecord(database, id); return run ? json(response, 200, { ...run, reportReady: Boolean(run.after || run.baseline || run.evaluations || run.plan) }) : json(response, 404, { error: 'Run not found' }); }
    if (request.method === 'POST' && segments[3] === 'results') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); if (!body.after) return json(response, 400, { error: 'After metrics are required' }); database.prepare('UPDATE optimization_runs SET after_json = ?, projection_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(body.after), body.projection ? JSON.stringify(body.projection) : null, new Date().toISOString(), id); return json(response, 200, runRecord(database, id)); }
    if (request.method === 'GET' && segments[3] === 'events') {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: 'Run not found' });
      response.statusCode = 200; response.setHeader('Content-Type', 'text/event-stream'); response.setHeader('Cache-Control', 'no-cache'); response.end(run.events.map(event => `event: agent\ndata: ${JSON.stringify(event)}\n\n`).join(''));
      return;
    }
    if (request.method === 'POST' && segments[3] === 'events') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const event = await readBody(request); if (!event.id || !event.label || !event.status || !event.detail) return json(response, 400, { error: 'Event id, label, status, and detail are required' }); appendEvent(database, id, event); return json(response, 201, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'start') return json(response, 200, updateRun(database, id, { status: 'preparing' }));
    if (request.method === 'POST' && segments[3] === 'cancel') return json(response, 200, updateRun(database, id, { status: 'cancelled' }));
    if (request.method === 'POST' && segments[3] === 'approve') return json(response, 200, updateRun(database, id, { approvalStatus: 'approved' }));
    if (request.method === 'POST' && segments[3] === 'github-branch') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); const branch = await createOptimizationBranch(body.repositoryUrl ?? run.repositoryUrl, body.baseBranch, body.branchName); database.prepare('UPDATE optimization_runs SET branch_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ baseBranch: body.baseBranch, baseCommitSha: branch.baseCommitSha, optimizationBranch: branch.branchName }), new Date().toISOString(), id); return json(response, 201, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'github-pr') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); if (run.approvalStatus !== 'approved') return json(response, 409, { error: 'Explicit approval is required before creating a pull request' }); const body = await readBody(request); if (body.approved !== true) return json(response, 409, { error: 'Explicit approval is required before creating a pull request' }); const pullRequest = await createPullRequest(body.repositoryUrl ?? run.repositoryUrl, body.head, body.base, body.title, body.body); database.prepare('UPDATE optimization_runs SET pull_request_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ number: pullRequest.number, url: pullRequest.url, title: pullRequest.title, status: 'created', branch: run.branch }), new Date().toISOString(), id); return json(response, 201, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'plan') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); database.prepare('UPDATE optimization_runs SET plan_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(body), new Date().toISOString(), id); return json(response, 200, { ...run, plan: body }); }
    if (request.method === 'POST' && segments[3] === 'baseline') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); database.prepare('UPDATE optimization_runs SET baseline_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(body), new Date().toISOString(), id); return json(response, 200, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'evaluations') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); if (!Array.isArray(body)) return json(response, 400, { error: 'Evaluations must be an array' }); database.prepare('UPDATE optimization_runs SET evaluations_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(body), new Date().toISOString(), id); return json(response, 200, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'publish') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); if (run.approvalStatus !== 'approved') return json(response, 409, { error: 'Explicit approval is required before publishing' }); return json(response, 200, updateRun(database, id, { status: 'publishing' })); }
    if (request.method === 'POST' && segments[1] === 'candidates' && segments[3] && ['approve', 'reject'].includes(segments[3])) { const run = updateCandidates(database, segments[2], segments[3] === 'approve'); return run ? json(response, 200, run) : json(response, 404, { error: 'Candidate not found' }); }
    return json(response, 404, { error: 'Unsupported run endpoint' });
  } catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : 'Invalid request' }); }
}

export { apiPlugin };
