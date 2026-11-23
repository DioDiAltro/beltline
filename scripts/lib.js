'use strict';
// Shared helpers for the Beltline walls (hooks). Plain Node, no dependencies, works on Windows, macOS and Linux.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// The kit's own agents. Hooks apply only to them: the user and the main session are never blocked.
const KIT_AGENTS = ['worker', 'scout', 'reviewer', 'silent-failure-hunter', 'test-analyzer', 'simplifier'];
const EDITING_AGENTS = ['worker', 'simplifier'];

function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// agent_type looks like "beltline:worker" for plugin agents; accept a bare "worker" too.
function agentName(input) {
  const t = input && typeof input.agent_type === 'string' ? input.agent_type : '';
  if (!t) return null;
  const i = t.lastIndexOf(':');
  const plugin = i >= 0 ? t.slice(0, i) : null;
  const name = i >= 0 ? t.slice(i + 1) : t;
  if (plugin && plugin !== 'beltline') return null;
  return KIT_AGENTS.includes(name) ? name : null;
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// The main repository root, also when called from inside a worktree.
function mainRoot(cwd) {
  if (!cwd || !fs.existsSync(cwd)) return null;
  const common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common) return path.dirname(common);
  return git(cwd, ['rev-parse', '--show-toplevel']);
}

// The root of the checkout (worktree or main) that contains a path.
function checkoutRoot(p) {
  let dir = p;
  while (dir && !fs.existsSync(dir)) dir = path.dirname(dir);
  if (dir && fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
  return dir ? git(dir, ['rev-parse', '--show-toplevel']) : null;
}

function toPosix(p) {
  return p.split(path.sep).join('/').replace(/\\/g, '/');
}

// Minimal glob: "**" any depth, "*" within a segment, "?" one character. A bare directory path matches its contents.
function globToRegex(glob) {
  let g = toPosix(glob.trim()).replace(/^\.\//, '');
  if (g.endsWith('/')) g += '**';
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      re += '.*';
      i++;
      if (g[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

function inScope(relPath, globs) {
  const rel = toPosix(relPath).replace(/^\.\//, '');
  return globs.some((g) => {
    const clean = toPosix(g.trim()).replace(/^\.\//, '');
    if (!clean) return false;
    if (globToRegex(clean).test(rel)) return true;
    return !/[*?]/.test(clean) && rel.startsWith(clean.replace(/\/$/, '') + '/');
  });
}

// scope.txt: blocks that start with "# task N branch=<name>", then paths or globs. Returns the block of the given
// branch if there is one, otherwise the union of all lines (other "#" lines are comments).
function readScope(root, branch) {
  const file = path.join(root, '.capo', 'scope.txt');
  if (!fs.existsSync(file)) return null;
  const all = [];
  const blocks = {};
  let current = null;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('#')) {
      const m = l.match(/branch=(\S+)/);
      if (/^#\s*task\b/i.test(l)) current = m ? m[1] : null;
      if (current && !blocks[current]) blocks[current] = [];
      continue;
    }
    all.push(l);
    if (current) blocks[current].push(l);
  }
  return branch && blocks[branch] ? blocks[branch] : all;
}

function currentBranch(dir) {
  return git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    })
  );
  process.exit(0);
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

module.exports = {
  KIT_AGENTS,
  EDITING_AGENTS,
  readInput,
  agentName,
  mainRoot,
  checkoutRoot,
  globToRegex,
  inScope,
  readScope,
  currentBranch,
  toPosix,
  deny,
  block,
};
