// @ts-nocheck
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      failure_reason TEXT,
      fallback_reason TEXT,
      trueforge_session_id TEXT,
      trueforge_turn_id TEXT
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
  return { id: run.id, repositoryUrl: run.repository_url, status: run.status, mode: run.mode, policy: JSON.parse(run.policy_json), candidates: JSON.parse(run.candidates_json), createdAt: run.created_at, updatedAt: run.updated_at, failureReason: run.failure_reason ?? undefined, fallbackReason: run.fallback_reason ?? undefined, trueForgeSessionId: run.trueforge_session_id ?? undefined, trueForgeTurnId: run.trueforge_turn_id ?? undefined, events };
}

function createRun(database, input) {
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  database.prepare('INSERT INTO optimization_runs (id, repository_url, status, mode, policy_json, candidates_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.repositoryUrl ?? 'fixture://inefficient-ai-app', 'created', input.mode ?? 'local-deterministic', JSON.stringify(input.policy ?? {}), JSON.stringify(input.candidates ?? []), now, now);
  return runRecord(database, id);
}

function updateRun(database, id, patch) {
  const current = database.prepare('SELECT * FROM optimization_runs WHERE id = ?').get(id);
  if (!current) return null;
  const next = { status: patch.status ?? current.status, mode: patch.mode ?? current.mode, failureReason: patch.failureReason ?? current.failure_reason, fallbackReason: patch.fallbackReason ?? current.fallback_reason, trueForgeSessionId: patch.trueForgeSessionId ?? current.trueforge_session_id, trueForgeTurnId: patch.trueForgeTurnId ?? current.trueforge_turn_id };
  database.prepare('UPDATE optimization_runs SET status = ?, mode = ?, updated_at = ?, failure_reason = ?, fallback_reason = ?, trueforge_session_id = ?, trueforge_turn_id = ? WHERE id = ?').run(next.status, next.mode, new Date().toISOString(), next.failureReason ?? null, next.fallbackReason ?? null, next.trueForgeSessionId ?? null, next.trueForgeTurnId ?? null, id);
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
  if (!pathname.startsWith('/api/runs') && !pathname.startsWith('/api/candidates')) return next();
  try {
    const segments = pathname.split('/').filter(Boolean);
    if (request.method === 'POST' && segments.length === 2) return json(response, 201, createRun(database, await readBody(request)));
    const id = segments[2];
    if (!id) return json(response, 400, { error: 'Run ID is required' });
    if (request.method === 'GET' && segments.length === 3) { const run = runRecord(database, id); return run ? json(response, 200, run) : json(response, 404, { error: 'Run not found' }); }
    if (request.method === 'GET' && segments[3] === 'candidates') { const run = runRecord(database, id); return run ? json(response, 200, { candidates: run.candidates }) : json(response, 404, { error: 'Run not found' }); }
    if (request.method === 'GET' && segments[3] === 'results') { const run = runRecord(database, id); return run ? json(response, 200, { status: run.status, mode: run.mode, candidates: run.candidates, events: run.events }) : json(response, 404, { error: 'Run not found' }); }
    if (request.method === 'GET' && segments[3] === 'events') {
      const run = runRecord(database, id);
      if (!run) return json(response, 404, { error: 'Run not found' });
      response.statusCode = 200; response.setHeader('Content-Type', 'text/event-stream'); response.setHeader('Cache-Control', 'no-cache'); response.end(run.events.map(event => `event: agent\ndata: ${JSON.stringify(event)}\n\n`).join(''));
      return;
    }
    if (request.method === 'POST' && segments[3] === 'start') return json(response, 200, updateRun(database, id, { status: 'preparing' }));
    if (request.method === 'POST' && segments[3] === 'cancel') return json(response, 200, updateRun(database, id, { status: 'cancelled' }));
    if (request.method === 'POST' && segments[3] === 'plan') { const run = runRecord(database, id); if (!run) return json(response, 404, { error: 'Run not found' }); const body = await readBody(request); database.prepare('UPDATE optimization_runs SET plan_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(body), new Date().toISOString(), id); return json(response, 200, { ...run, plan: body }); }
    if (request.method === 'POST' && segments[3] === 'publish') return json(response, 200, updateRun(database, id, { status: 'publishing' }));
    if (request.method === 'POST' && segments[1] === 'candidates' && segments[3] && ['approve', 'reject'].includes(segments[3])) { const run = updateCandidates(database, segments[2], segments[3] === 'approve'); return run ? json(response, 200, run) : json(response, 404, { error: 'Candidate not found' }); }
    return json(response, 404, { error: 'Unsupported run endpoint' });
  } catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : 'Invalid request' }); }
}

export { apiPlugin };
