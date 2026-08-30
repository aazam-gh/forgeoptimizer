// @ts-nocheck
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { canTransition } from '../src/runState.ts';
import { commitOptimizationChanges, createOptimizationBranch, createPullRequest, inspectCommit, inspectRepository, listRepositoryBranches } from './github.ts';
import { assessValidationGate, approveValidationGate } from '../src/validation.ts';
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
      source_branch TEXT,
      source_commit_sha TEXT,
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
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN source_branch TEXT'); } catch { /* already migrated */ }
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN source_commit_sha TEXT'); } catch { /* already migrated */ }
  try { database.exec("ALTER TABLE optimization_runs ADD COLUMN scenarios_json TEXT NOT NULL DEFAULT '[]'"); } catch { /* already migrated */ }
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN validation_json TEXT'); } catch { /* already migrated */ }
  try { database.exec('ALTER TABLE optimization_runs ADD COLUMN patch_files_json TEXT'); } catch { /* already migrated */ }
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
  return { id: run.id, repositoryUrl: run.repository_url, sourceBranch: run.source_branch ?? undefined, sourceCommitSha: run.source_commit_sha ?? undefined, scenarios: JSON.parse(run.scenarios_json ?? '[]'), patchFiles: run.patch_files_json ? JSON.parse(run.patch_files_json) : undefined, validation: run.validation_json ? JSON.parse(run.validation_json) : undefined, status: run.status, mode: run.mode, approvalStatus: run.approval_status, policy: JSON.parse(run.policy_json), plan: run.plan_json ? JSON.parse(run.plan_json) : undefined, branch: run.branch_json ? JSON.parse(run.branch_json) : undefined, pullRequest: run.pull_request_json ? JSON.parse(run.pull_request_json) : undefined, baseline: run.baseline_json ? JSON.parse(run.baseline_json) : undefined, evaluations: run.evaluations_json ? JSON.parse(run.evaluations_json) : undefined, after: run.after_json ? JSON.parse(run.after_json) : undefined, projection: run.projection_json ? JSON.parse(run.projection_json) : undefined, candidates: JSON.parse(run.candidates_json), usages: JSON.parse(run.usages_json), before: JSON.parse(run.before_json), createdAt: run.created_at, updatedAt: run.updated_at, failureReason: run.failure_reason ?? undefined, fallbackReason: run.fallback_reason ?? undefined, trueForgeSessionId: run.trueforge_session_id ?? undefined, trueForgeTurnId: run.trueforge_turn_id ?? undefined, events };
}

function runRecords(database) {
  return database.prepare('SELECT id FROM optimization_runs ORDER BY updated_at DESC LIMIT 100').all().map(row => runRecord(database, row.id));
}

function createRun(database, input) {
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  database.prepare('INSERT INTO optimization_runs (id, repository_url, source_branch, source_commit_sha, scenarios_json, status, mode, policy_json, candidates_json, usages_json, before_json, approval_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.repositoryUrl ?? 'fixture://inefficient-ai-app', input.sourceBranch ?? null, input.sourceCommitSha ?? null, JSON.stringify(input.scenarios ?? []), 'created', input.mode ?? 'local-deterministic', JSON.stringify(input.policy ?? {}), JSON.stringify(input.candidates ?? []), JSON.stringify(input.usages ?? []), JSON.stringify(input.before ?? {}), input.approvalStatus ?? 'pending', now, now);
  return runRecord(database, id);
}

function appendEvent(database, runId, event) {
  database.prepare('INSERT OR REPLACE INTO agent_events (id, run_id, label, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(event.id ?? randomUUID(), runId, event.label, event.status, event.detail, new Date().toISOString());
}

function streamEvents(response, database, runId) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  const sent = new Set();
  const flush = () => {
    const run = runRecord(database, runId);
    if (!run) { response.end(); return; }
    for (const event of run.events) {
      if (sent.has(event.id)) continue;
      sent.add(event.id);
      response.write(`event: agent\ndata: ${JSON.stringify(event)}\n\n`);
    }
    response.write(': keep-alive\n\n');
    if (['completed', 'failed', 'cancelled'].includes(run.status)) response.end();
  };
  flush();
  const interval = setInterval(flush, 1000);
  response.on('close', () => clearInterval(interval));
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

function findCandidate(database, candidateId) {
  const runs = database.prepare('SELECT id, candidates_json FROM optimization_runs').all();
  for (const run of runs) {
    const candidate = JSON.parse(run.candidates_json).find(candidate => candidate.id === candidateId);
    if (candidate) return { runId: run.id, candidate };
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
  if (!pathname.startsWith('/api/runs') && !pathname.startsWith('/api/candidates') && !pathname.startsWith('/api/github') && !pathname.startsWith('/api/repositories')) return next();
  try {
    const segments = pathname.split('/').filter(Boolean);
    if (request.method === 'GET' && pathname === '/api/repositories/history') { const repositoryUrl = new URL(request.url ?? '/', 'http://localhost').searchParams.get('repositoryUrl'); if (!repositoryUrl) return json(response, 400, { error: 'repositoryUrl is required' }); const runs = runRecords(database).filter(run => run.repositoryUrl === repositoryUrl); const latest = runs[0]; const beforeCost = runs.reduce((sum, run) => sum + (run.before?.cost ?? 0), 0); const afterCost = runs.reduce((sum, run) => sum + (run.after?.cost ?? run.before?.cost ?? 0), 0); return json(response, 200, { repositoryUrl, aiSpend: beforeCost, aiCalls: runs.reduce((sum, run) => sum + (run.before?.calls ?? 0), 0), savingsDiscovered: Math.max(0, beforeCost - afterCost), latestOptimizedCommit: latest?.branch?.resultingCommitSha, runs }); }
    if (request.method === 'POST' && pathname === '/api/github/repository') { const body = await readBody(request); return json(response, 200, await inspectRepository(body.repositoryUrl, body.branch)); }
    if (request.method === 'POST' && pathname === '/api/github/branches') { const body = await readBody(request); return json(response, 200, { branches: await listRepositoryBranches(body.repositoryUrl) }); }
    if (request.method === 'POST' && pathname === '/api/github/commit') { const body = await readBody(request); return json(response, 200, await inspectCommit(body.repositoryUrl, body.commitSha)); }
    if (request.method === 'POST' && pathname === '/api/github/branch') { const body = await readBody(request); return json(response, 201, await createOptimizationBranch(body.repositoryUrl, body.baseBranch, body.branchName)); }
    if (request.method === 'POST' && pathname === '/api/github/pull-request') { const body = await readBody(request); if (body.approved !== true) return json(response, 409, { error: 'Explicit approval is required before creating a pull request' }); if (!body.validation) return json(response, 409, { error: 'Validation gate is not complete' }); const validation = assessValidationGate(body.validation); if (!validation.canPublish) return json(response, 409, { error: 'Validation gate is not complete', validation }); const reportBody = body.body ?? (body.report ? buildOptimizationReport({ ...body.report, validation }) : undefined); if (!reportBody) return json(response, 400, { error: 'Evidence-backed report body is required' }); return json(response, 201, await createPullRequest(body.repositoryUrl, body.head, body.base, body.title, reportBody)); }
    if (segments[1] === 'candidates') {
      const candidateRecord = findCandidate(database, segments[2]);
      if (!candidateRecord) return json(response, 404, { error: 'Candidate not found' });
      if (request.method === 'GET' && segments[3] === 'diff') return json(response, 200, { candidate: candidateRecord.candidate.id, runId: candidateRecord.runId, diff: candidateRecord.candidate.diff ?? '' });
      if (request.method === 'POST' && segments[3] === 'execute') {
        appendEvent(database, candidateRecord.runId, { id: `candidate-${candidateRecord.candidate.id}-execute`, label: 'Candidate execution', status: 'active', detail: `Execution requested for ${candidateRecord.candidate.title}` });
        return json(response, 202, { runId: candidateRecord.runId, candidate: candidateRecord.candidate, status: 'queued' });
      }
    }
    if (request.method === 'POST' && segments.length === 2) return json(response, 201, createRun(database, await readBody(request)));
    if (request.method === 'GET' && segments.length === 2) return json(response, 200, runRecords(database));
    const id = segments[2];
    if (!id) return json(response, 400, { error: 'Run ID is required' });
    if (request.method === 'POST' && segments[3] === 'github-commit') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); if (run.approvalStatus !== 'approved') return json(response, 409, { error: 'Explicit approval is required before committing optimization changes' }); if (!run.branch) return json(response, 409, { error: 'Optimization branch must be created first' }); const body = await readBody(request); const commit = await commitOptimizationChanges(body.repositoryUrl ?? run.repositoryUrl, run.branch.optimizationBranch, body.files, body.message); const branch = { ...run.branch, resultingCommitSha: commit.commitSha }; database.prepare('UPDATE optimization_runs SET branch_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(branch), new Date().toISOString(), id); return json(response, 201, { ...runRecord(database, id), commit }); }
    if (request.method === 'GET' && segments.length === 3) { const run = runRecord(database, id); return run ? json(response, 200, run) : json(response, 404, { error: 'Run not found' }); }
    if (request.method === 'GET' && segments[3] === 'candidates') { const run = runRecord(database, id); return run ? json(response, 200, { candidates: run.candidates }) : json(response, 404, { error: 'Run not found' }); }
    if (request.method === 'GET' && segments[3] === 'results') { const run = runRecord(database, id); return run ? json(response, 200, { ...run, reportReady: Boolean(run.after || run.baseline || run.evaluations || run.plan) }) : json(response, 404, { error: 'Run not found' }); }
    if (request.method === 'POST' && segments[3] === 'results') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); if (!body.after) return json(response, 400, { error: 'After metrics are required' }); database.prepare('UPDATE optimization_runs SET after_json = ?, projection_json = ?, validation_json = ?, patch_files_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(body.after), body.projection ? JSON.stringify(body.projection) : null, body.validation ? JSON.stringify(body.validation) : null, Array.isArray(body.patchFiles) ? JSON.stringify(body.patchFiles) : null, new Date().toISOString(), id); return json(response, 200, runRecord(database, id)); }
    if (request.method === 'GET' && segments[3] === 'events') {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: 'Run not found' });
      streamEvents(response, database, id);
      return;
    }
    if (request.method === 'POST' && segments[3] === 'events') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const event = await readBody(request); if (!event.id || !event.label || !event.status || !event.detail) return json(response, 400, { error: 'Event id, label, status, and detail are required' }); appendEvent(database, id, event); return json(response, 201, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'start') return json(response, 200, updateRun(database, id, { status: 'preparing' }));
    if (request.method === 'POST' && segments[3] === 'cancel') return json(response, 200, updateRun(database, id, { status: 'cancelled' }));
    if (request.method === 'POST' && segments[3] === 'approve') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); if (!run.validation) return json(response, 409, { error: 'Validation gate is not complete' }); const validation = approveValidationGate(run.validation); if (!validation.canPublish) return json(response, 409, { error: 'Validation gate is not complete', validation }); database.prepare('UPDATE optimization_runs SET validation_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(validation), new Date().toISOString(), id); return json(response, 200, updateRun(database, id, { approvalStatus: 'approved' })); }
    if (request.method === 'POST' && segments[3] === 'github-branch') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); const branch = await createOptimizationBranch(body.repositoryUrl ?? run.repositoryUrl, body.baseBranch, body.branchName); database.prepare('UPDATE optimization_runs SET source_branch = ?, source_commit_sha = ?, branch_json = ?, updated_at = ? WHERE id = ?').run(body.baseBranch, branch.baseCommitSha, JSON.stringify({ baseBranch: body.baseBranch, baseCommitSha: branch.baseCommitSha, optimizationBranch: branch.branchName }), new Date().toISOString(), id); return json(response, 201, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'github-pr') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); if (run.approvalStatus !== 'approved') return json(response, 409, { error: 'Explicit approval is required before creating a pull request' }); if (!run.branch?.resultingCommitSha) return json(response, 409, { error: 'A resulting optimization commit is required before creating a pull request' }); const body = await readBody(request); if (body.approved !== true) return json(response, 409, { error: 'Explicit approval is required before creating a pull request' }); const pullRequest = await createPullRequest(body.repositoryUrl ?? run.repositoryUrl, body.head, body.base, body.title, body.body); database.prepare('UPDATE optimization_runs SET pull_request_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ number: pullRequest.number, url: pullRequest.url, title: pullRequest.title, status: 'created', branch: run.branch }), new Date().toISOString(), id); return json(response, 201, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'plan') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); database.prepare('UPDATE optimization_runs SET plan_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(body), new Date().toISOString(), id); return json(response, 200, { ...run, plan: body }); }
    if (request.method === 'POST' && segments[3] === 'baseline') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); database.prepare('UPDATE optimization_runs SET baseline_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(body), new Date().toISOString(), id); return json(response, 200, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'evaluations') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); if (!Array.isArray(body)) return json(response, 400, { error: 'Evaluations must be an array' }); database.prepare('UPDATE optimization_runs SET evaluations_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(body), new Date().toISOString(), id); return json(response, 200, runRecord(database, id)); }
    if (request.method === 'POST' && segments[3] === 'publish') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); if (run.approvalStatus !== 'approved') return json(response, 409, { error: 'Explicit approval is required before publishing' }); return json(response, 200, updateRun(database, id, { status: 'publishing' })); }
    if (request.method === 'POST' && segments[1] === 'candidates' && segments[3] && ['approve', 'reject'].includes(segments[3])) { const run = updateCandidates(database, segments[2], segments[3] === 'approve'); return run ? json(response, 200, run) : json(response, 404, { error: 'Candidate not found' }); }
    return json(response, 404, { error: 'Unsupported run endpoint' });
  } catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : 'Invalid request' }); }
}

export { apiPlugin };
