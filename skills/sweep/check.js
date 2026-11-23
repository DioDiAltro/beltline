#!/usr/bin/env node
'use strict';
// Machine checks before beltline:sweep removes a finished job. Prints a JSON report; changes nothing.
// Usage: node check.js <job folder or job name> [repo dir]

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function header(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (m) for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

// The ledger table: find columns by their header names.
function ledgerRows(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\|\s*Task\s*\|/i.test(l));
  if (start < 0) return [];
  const cols = lines[start].split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
  const rows = [];
  for (const l of lines.slice(start + 2)) {
    if (!l.startsWith('|')) break;
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    const row = {};
    cols.forEach((c, i) => (row[c] = cells[i] || ''));
    rows.push(row);
  }
  return rows;
}

function findLedger(root, job) {
  const capo = path.join(root, '.capo');
  const candidates = [path.join(capo, 'ledger.md')];
  const archive = path.join(capo, 'archive');
  if (fs.existsSync(archive)) for (const f of fs.readdirSync(archive)) candidates.push(path.join(archive, f));
  for (const f of candidates) {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
    const text = fs.readFileSync(f, 'utf8');
    if (text.includes(job)) return { file: f, text };
  }
  return null;
}

function main(arg, repo) {
  const root = git(repo, ['rev-parse', '--show-toplevel']);
  if (!root) return { ok: false, error: 'not a git repository' };
  const job = path.basename(String(arg).replace(/[\\/]+$/, ''));
  const rel = `docs/beltline/${job}`;
  const dir = path.join(root, rel);
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

  // 1. The folder is a Beltline job folder and both documents say done.
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(job)) add('job name', false, `${job} is not YYYY-MM-DD-<slug>`);
  if (!fs.existsSync(dir)) {
    add('job folder', false, `${rel} does not exist`);
  } else {
    const files = fs.readdirSync(dir);
    const other = files.filter((f) => !['design.md', 'plan.md'].includes(f));
    add('only job documents', other.length === 0, other.length ? `other files: ${other.join(', ')}` : '');
    for (const f of ['design.md', 'plan.md']) {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) {
        add(`${f} present`, false, 'missing');
        continue;
      }
      const h = header(p);
      add(`${f} header`, !!h.beltline && h.job === job, h.job ? `job: ${h.job}` : 'no Beltline header');
      add(`${f} status done`, h.status === 'done', `status: ${h.status || 'none'}`);
    }
    const dirty = git(root, ['status', '--porcelain', '--', rel]);
    add('folder committed', dirty === '', dirty ? 'uncommitted changes in the job folder' : '');
  }

  // 2. The ledger: every task done, every task branch merged.
  const ledger = findLedger(root, job);
  const branches = [];
  const worktrees = [];
  if (!ledger) {
    add('ledger found', false, 'no ledger mentions this job: tasks cannot be checked');
  } else {
    const rows = ledgerRows(ledger.text);
    const open = rows.filter((r) => (r.status || '').toLowerCase() !== 'done');
    add('ledger found', true, path.relative(root, ledger.file));
    add('all tasks done', rows.length > 0 && open.length === 0,
      rows.length === 0 ? 'no task rows' : open.map((r) => `task ${r.task}: ${r.status}`).join('; '));
    for (const r of rows) {
      const b = r.branch;
      if (b && b !== '—' && b !== '-') {
        const exists = git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]);
        if (exists) {
          const merged = git(root, ['merge-base', '--is-ancestor', b, 'HEAD']) !== null;
          add(`branch ${b} merged`, merged, merged ? '' : 'has commits not in HEAD');
          if (merged) branches.push(b);
        }
      }
      const w = r.worktree;
      if (w && w !== '—' && w !== '-' && fs.existsSync(path.resolve(root, w))) worktrees.push(w);
    }
  }

  // 3. Nothing else in the repository points at the job folder.
  const refs = git(root, ['grep', '-l', '-F', rel, '--', '.', `:!${rel}`, ':!docs/beltline/INDEX.md']);
  add('no references', !refs, refs ? `referenced by: ${refs.split('\n').join(', ')}` : '');

  const capoFiles = [];
  const capo = path.join(root, '.capo');
  if (ledger && path.dirname(ledger.file) === capo && fs.existsSync(capo)) {
    for (const f of fs.readdirSync(capo)) if (/^task-\d+/.test(f) || f === 'scope.txt') capoFiles.push(`.capo/${f}`);
  }

  const ok = checks.every((c) => c.ok);
  return {
    job,
    ok,
    checks,
    remove: ok ? { docs: [rel], capo: capoFiles, worktrees, branches } : null,
  };
}

if (require.main === module) {
  const [arg, repo] = process.argv.slice(2);
  if (!arg) {
    process.stderr.write('usage: node check.js <job folder or name> [repo dir]\n');
    process.exit(2);
  }
  const report = main(arg, repo || process.cwd());
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(report.ok ? 0 : 1);
}

module.exports = { main, ledgerRows, header };
