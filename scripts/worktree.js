#!/usr/bin/env node
'use strict';
// The capo's worktrees: every task works in its own checkout, so the main one stays clean while agents work.
// add:    node worktree.js add --repo <main root> --job <job> --task <id> --branch <name> --base <commit> [--deps link|none|"<install command>"]
//         Creates <parent of repo>/<repo>-worktrees/<job>-t<id> on a new branch from BASE. Dependencies: "link" (default)
//         links the main checkout's node_modules (fast; for tasks run one at a time that do not change dependencies);
//         an install command (for example "npm ci") runs inside the new checkout (parallel tasks, or a task that changes
//         dependencies). Prints {"dir", "branch", "deps"}.
// remove: node worktree.js remove --repo <main root> --dir <worktree>
//         Removes the dependency link first, then the worktree without --force: git refuses if work is not committed.
//         Prints {"removed": true|false, "reason"}.

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function unlinkDeps(dir) {
  const link = path.join(dir, 'node_modules');
  try {
    if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
  } catch {
    try {
      fs.rmdirSync(link); // a Windows junction
    } catch {
      // no link
    }
  }
}

function add() {
  const repo = path.resolve(arg('repo') || process.cwd());
  const job = arg('job');
  const task = arg('task');
  const branch = arg('branch');
  const base = arg('base');
  const deps = arg('deps') || 'link';
  if (!job || !task || !branch || !base) {
    process.stderr.write('usage: node worktree.js add --repo <root> --job <job> --task <id> --branch <name> --base <commit> [--deps link|none|"<cmd>"]\n');
    process.exit(2);
  }
  const root = git(repo, ['rev-parse', '--show-toplevel']);
  const dir = path.join(path.dirname(root), `${path.basename(root)}-worktrees`, `${job}-t${task}`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(root, ['worktree', 'add', '--quiet', '-b', branch, dir, base]);
  let done = 'none';
  if (deps === 'link') {
    const src = path.join(root, 'node_modules');
    if (fs.existsSync(src) && !fs.existsSync(path.join(dir, 'node_modules'))) {
      fs.symlinkSync(src, path.join(dir, 'node_modules'), 'junction');
      done = 'link';
    }
  } else if (deps !== 'none') {
    const r = spawnSync(deps, { cwd: dir, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    done = r.status === 0 ? 'installed' : `install failed (exit ${r.status})`;
  }
  return { dir, branch, deps: done };
}

function remove() {
  const repo = path.resolve(arg('repo') || process.cwd());
  const dir = arg('dir');
  if (!dir) {
    process.stderr.write('usage: node worktree.js remove --repo <root> --dir <worktree>\n');
    process.exit(2);
  }
  unlinkDeps(dir);
  try {
    git(repo, ['worktree', 'remove', dir]);
    return { removed: true };
  } catch (e) {
    return { removed: false, reason: String(e.stderr || e.message).trim().split('\n')[0] };
  }
}

if (require.main === module) {
  const cmd = process.argv[2];
  let out;
  try {
    if (cmd === 'add') out = add();
    else if (cmd === 'remove') out = remove();
    else {
      process.stderr.write('usage: node worktree.js add|remove …\n');
      process.exit(2);
    }
  } catch (e) {
    out = { error: String(e.stderr || e.message).trim().split('\n')[0] };
  }
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(out.error ? 1 : 0);
}
