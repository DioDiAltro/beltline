'use strict';
// Shared helpers for the Beltline hooks and scripts. Plain Node, no dependencies, works on Windows, macOS and Linux.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// The kit's own agents. The walls apply only to them: the user and the main session are never blocked.
const KIT_AGENTS = ['worker', 'scout', 'reviewer', 'inspector', 'silent-failure-hunter', 'test-analyzer', 'simplifier'];
const EDITING_AGENTS = ['worker', 'simplifier'];
// A task id is a number with an optional letter suffix: 3, 8a.
const TASK_ID = '[0-9]+[a-z]*';

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
  while (dir && !fs.existsSync(dir)) {
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  if (dir && fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
  return dir ? git(dir, ['rev-parse', '--show-toplevel']) : null;
}

function currentBranch(dir) {
  return git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

function toPosix(p) {
  return String(p).split(path.sep).join('/').replace(/\\/g, '/');
}

// Two paths name the same folder (case-insensitive on Windows and macOS, symlinks resolved when possible).
function samePath(a, b) {
  if (!a || !b) return false;
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  let x = toPosix(real(a)).replace(/\/+$/, '');
  let y = toPosix(real(b)).replace(/\/+$/, '');
  if (process.platform === 'win32' || process.platform === 'darwin') {
    x = x.toLowerCase();
    y = y.toLowerCase();
  }
  return x === y;
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

// ---- The job folder: .capo/<job>/ holds everything of one job; .capo/active names the running job. ----

function capoDir(root) {
  return path.join(root, '.capo');
}

// Fast check before any git call: is there a .capo/active file in this folder or above it?
function hasActive(cwd) {
  let dir = cwd ? path.resolve(cwd) : null;
  while (dir) {
    if (fs.existsSync(path.join(dir, '.capo', 'active'))) return true;
    const up = path.dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
  return false;
}

function activeJob(root) {
  try {
    const job = fs.readFileSync(path.join(capoDir(root), 'active'), 'utf8').trim().split(/\r?\n/)[0].trim();
    if (job && /^[\w.-]+$/.test(job) && fs.existsSync(path.join(capoDir(root), job))) return job;
  } catch {
    // no active job
  }
  return null;
}

// Scope files: .capo/<job>/scope.txt (0.3) and .capo/scope.txt (0.2). A block starts with
// "# task <id> branch=<name> dir=<checkout>"; lines before any block apply to every branch.
function readScopes(root) {
  const files = [];
  const capo = capoDir(root);
  if (!fs.existsSync(capo)) return null;
  const legacy = path.join(capo, 'scope.txt');
  if (fs.existsSync(legacy)) files.push({ file: legacy, job: null });
  for (const d of fs.readdirSync(capo)) {
    const f = path.join(capo, d, 'scope.txt');
    if (d !== 'archive' && fs.existsSync(f)) files.push({ file: f, job: d });
  }
  if (!files.length) return null;
  const blocks = [];
  const loose = [];
  for (const { file, job } of files) {
    let current = null;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith('#')) {
        const m = l.match(new RegExp('^#\\s*task\\s+(' + TASK_ID + ')\\b(.*)$', 'i'));
        if (m) {
          const b = (m[2].match(/\bbranch=(\S+)/) || [])[1] || null;
          const d = ((m[2].match(/\bdir=(.+)$/) || [])[1] || '').trim().replace(/^["']|["']$/g, '') || null;
          current = { job, task: m[1].toLowerCase(), branch: b, dir: d, globs: [] };
          blocks.push(current);
        }
        continue;
      }
      if (current) current.globs.push(l);
      else loose.push(l);
    }
  }
  return { blocks, loose };
}

// ---- Transcripts ----

// The subagent's own transcript: from the hook input when given, otherwise next to the main transcript.
function agentTranscript(input) {
  if (input.agent_transcript_path) return expandHome(input.agent_transcript_path);
  if (!input.transcript_path || !input.agent_id) return null;
  const main = expandHome(input.transcript_path);
  // already the subagent's own file
  if (path.basename(main) === `agent-${input.agent_id}.jsonl`) return main;
  const session = path.basename(main, '.jsonl');
  const dir = path.join(path.dirname(main), session, 'subagents');
  const file = path.join(dir, `agent-${input.agent_id}.jsonl`);
  if (fs.existsSync(file)) return file;
  // the documented layout is the one above; accept a file whose name carries the id, in case it changes
  try {
    const hit = fs.readdirSync(dir).find((f) => f.endsWith('.jsonl') && f.includes(String(input.agent_id)));
    if (hit) return path.join(dir, hit);
  } catch {
    // no subagents folder
  }
  return file;
}

function expandHome(p) {
  return String(p).replace(/^~(?=$|[\\/])/, os.homedir());
}

function readHead(file, bytes) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    fs.closeSync(fd);
    return buf.slice(0, n).toString('utf8');
  } catch {
    return '';
  }
}

function readTail(file, bytes) {
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - bytes);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, size - start, start);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

// The brief named in a prompt: ".capo/<job>/task-<id>.md" (0.3) or ".capo/task-<id>.md" (0.2).
const BRIEF_RE = new RegExp('\\.capo/(?:([\\w.-]+)/)?task-(' + TASK_ID + ')(?:-r(\\d+)-[\\w-]+)?\\.md', 'i');

function briefOf(text) {
  const t = toPosix(text || '');
  const m = t.match(BRIEF_RE);
  if (!m) return null;
  const round = t.match(new RegExp('task-' + m[2] + '-r(\\d+)-', 'i'));
  return { job: m[1] || null, task: m[2].toLowerCase(), round: round ? Number(round[1]) : null };
}

// The agent's own task, read from the first message of its transcript.
function agentTask(input) {
  const tp = agentTranscript(input);
  if (!tp) return null;
  for (const line of readHead(tp, 64 * 1024).split('\n')) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const m = obj && obj.message;
    if (m && m.role === 'user') {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
      return briefOf(text);
    }
  }
  return null;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('\n');
  return '';
}

// What a tool call was about, in a few words: the file, the command or the pattern.
function whatOf(name, input) {
  const i = input || {};
  const v = i.file_path || i.notebook_path || i.path || i.command || i.pattern || i.url || i.description || i.prompt || '';
  return `${name} ${String(v).replace(/\s+/g, ' ')}`.trim().slice(0, 90);
}

// Usage totals of a transcript, counted once per message (a message spans several lines while streaming), plus the
// size of the last request (the context at that moment) and the largest tool results. With a state object it reads
// only what was added since the last call.
function scanTranscript(file, state) {
  const s = state || {};
  s.offset = s.offset || 0;
  s.totals = s.totals || { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  s.top = s.top || [];
  s.calls = s.calls || {};
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return s;
  }
  if (size < s.offset) {
    // the file was replaced: start again
    Object.assign(s, { offset: 0, lastId: null, lastUsage: null, top: [], calls: {} });
    s.totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  }
  if (size === s.offset) return s;
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(size - s.offset);
  fs.readSync(fd, buf, 0, buf.length, s.offset);
  fs.closeSync(fd);
  const text = buf.toString('utf8');
  const end = text.lastIndexOf('\n');
  if (end < 0) return s;
  s.offset += Buffer.byteLength(text.slice(0, end + 1), 'utf8');
  const commit = () => {
    if (!s.lastUsage) return;
    for (const k of Object.keys(s.totals)) s.totals[k] += Number(s.lastUsage[k] || 0);
  };
  for (const line of text.slice(0, end).split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const m = obj && obj.message;
    if (!m) continue;
    if (s.firstUser === undefined && m.role === 'user') s.firstUser = textOf(m.content).slice(0, 4000) || JSON.stringify(m.content || '').slice(0, 4000);
    if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (!b) continue;
        if (b.type === 'tool_use' && b.id) s.calls[b.id] = whatOf(b.name, b.input);
        if (b.type === 'tool_result' && b.tool_use_id) {
          const tokens = Math.round(textOf(b.content).length / 4);
          const what = s.calls[b.tool_use_id] || 'tool';
          delete s.calls[b.tool_use_id];
          if (tokens > 500) {
            s.top.push({ what, tokens });
            s.top.sort((a, c) => c.tokens - a.tokens);
            s.top = s.top.slice(0, 5);
          }
        }
      }
      const ids = Object.keys(s.calls);
      if (ids.length > 200) for (const id of ids.slice(0, ids.length - 200)) delete s.calls[id];
    }
    if (!m.usage) continue;
    if (m.model) s.model = m.model;
    const id = m.id || obj.uuid || null;
    if (id && id === s.lastId) {
      s.lastUsage = m.usage;
    } else {
      commit();
      s.lastId = id;
      s.lastUsage = m.usage;
    }
    const u = m.usage;
    s.context = Number(u.input_tokens || 0) + Number(u.cache_read_input_tokens || 0) + Number(u.cache_creation_input_tokens || 0);
  }
  return s;
}

// The totals so far, the last message included.
function totalsOf(s) {
  const t = Object.assign({}, s.totals);
  if (s.lastUsage) for (const k of Object.keys(t)) t[k] += Number(s.lastUsage[k] || 0);
  return t;
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

function addContext(event, text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
  process.exit(0);
}

module.exports = {
  KIT_AGENTS,
  EDITING_AGENTS,
  TASK_ID,
  readInput,
  agentName,
  git,
  mainRoot,
  checkoutRoot,
  currentBranch,
  toPosix,
  samePath,
  globToRegex,
  inScope,
  capoDir,
  hasActive,
  activeJob,
  readScopes,
  agentTranscript,
  agentTask,
  briefOf,
  readTail,
  scanTranscript,
  totalsOf,
  deny,
  block,
  addContext,
};
