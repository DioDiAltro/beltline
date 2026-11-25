#!/usr/bin/env node
'use strict';
// Wall: shell commands the kit's agents may never run. The user and the main session are not affected.
// The command is split like a shell would split it (lines, ;, &&, ||, |, subshells, quotes, heredocs), wrappers and
// variable assignments in front of a program are skipped, and "bash -c", "sh -c", "eval" and PowerShell -Command are
// read again from inside. It is a guardrail against habits and mistakes, not a sandbox.

const path = require('path');
const { readInput, agentName, deny, toPosix, TASK_ID } = require('./lib');

// ---- Splitting a command line ----

function lex(cmd, ps = false) {
  const segs = [];
  let cur = [];
  let word = '';
  let has = false;
  let heredocs = [];
  let i = 0;
  const pushWord = () => {
    if (has) cur.push(word);
    word = '';
    has = false;
  };
  const endSeg = () => {
    pushWord();
    if (cur.length) segs.push(cur);
    cur = [];
  };
  while (i < cmd.length) {
    const c = cmd[i];
    if (c === "'") {
      const j = cmd.indexOf("'", i + 1);
      const end = j < 0 ? cmd.length : j;
      word += cmd.slice(i + 1, end);
      has = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < cmd.length && cmd[j] !== '"') {
        if (cmd[j] === '\\' && j + 1 < cmd.length) {
          s += cmd[j + 1];
          j += 2;
        } else {
          s += cmd[j];
          j++;
        }
      }
      word += s;
      has = true;
      i = j + 1;
      continue;
    }
    if (ps && c === '`') {
      // PowerShell escapes with a backtick; a backslash is a path separator there
      if (i + 1 < cmd.length && cmd[i + 1] !== '\n') {
        word += cmd[i + 1];
        has = true;
      }
      i += 2;
      continue;
    }
    if (c === '\\' && !ps) {
      if (cmd[i + 1] === '\n') i += 2;
      else {
        if (i + 1 < cmd.length) {
          word += cmd[i + 1];
          has = true;
        }
        i += 2;
      }
      continue;
    }
    if (c === '\n') {
      endSeg();
      i++;
      // heredoc bodies are data, not commands
      for (const h of heredocs) {
        while (i < cmd.length) {
          const nl = cmd.indexOf('\n', i);
          const line = cmd.slice(i, nl < 0 ? cmd.length : nl);
          i = nl < 0 ? cmd.length : nl + 1;
          if ((h.strip ? line.replace(/^\t+/, '') : line).trim() === h.delim) break;
        }
      }
      heredocs = [];
      continue;
    }
    if (c === '<' && cmd[i + 1] === '<' && cmd[i + 2] !== '<') {
      // heredoc: remember the delimiter, the body starts on the next line
      pushWord();
      i += 2;
      let strip = false;
      if (cmd[i] === '-') {
        strip = true;
        i++;
      }
      while (cmd[i] === ' ' || cmd[i] === '\t') i++;
      let delim = '';
      while (i < cmd.length && !/[\s;&|<>()]/.test(cmd[i])) {
        if (cmd[i] !== '"' && cmd[i] !== "'" && cmd[i] !== '\\') delim += cmd[i];
        i++;
      }
      if (delim) heredocs.push({ delim, strip });
      continue;
    }
    if (c === ';' || c === '(' || c === ')' || c === '{' || c === '}' || c === '`') {
      endSeg();
      i++;
      continue;
    }
    if (c === '$' && cmd[i + 1] === '(') {
      endSeg();
      i += 2;
      continue;
    }
    if (c === '&' && cmd[i + 1] === '>') {
      pushWord();
      cur.push('>');
      i += cmd[i + 2] === '>' ? 3 : 2;
      continue;
    }
    if (c === '&' || c === '|') {
      endSeg();
      i += cmd[i + 1] === c || (c === '|' && cmd[i + 1] === '&') ? 2 : 1;
      continue;
    }
    if (c === '>' || c === '<') {
      if (has && /^\d+$/.test(word)) {
        word = '';
        has = false;
      } else pushWord();
      if (cmd[i + 1] === c) i++;
      if (c === '<' && cmd[i + 1] === '<') i++; // here-string <<<
      if (cmd[i + 1] === '&' || cmd[i + 1] === '|') i++;
      cur.push(c === '>' ? '>' : '<');
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      pushWord();
      i++;
      continue;
    }
    word += c;
    has = true;
    i++;
  }
  endSeg();
  return segs;
}

const base = (p) => path.basename(toPosix(p).split('/').pop() || '').toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
const WRAPPERS = new Set(['command', 'builtin', 'exec', 'nohup', 'time', 'nice', 'sudo', 'doas', 'env', 'xargs', 'stdbuf', 'timeout', 'unbuffer']);
const VALUE_OPTS = {
  sudo: /^-[ugCDhpRrT]$/,
  doas: /^-[uC]$/,
  nice: /^-n$/,
  env: /^-[uSC]$/,
  xargs: /^-[IdEeLnPs]$/,
  timeout: /^-[sk]$/,
  stdbuf: /^-[ioe]$/,
};

// Program, arguments and output files of one segment.
function commandOf(tokens) {
  const words = [];
  const outs = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '>') {
      if (i + 1 < tokens.length) outs.push(tokens[++i]);
      continue;
    }
    if (tokens[i] === '<') {
      i++;
      continue;
    }
    words.push(tokens[i]);
  }
  let k = 0;
  while (k < words.length) {
    const w = words[k];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) {
      k++;
      continue;
    }
    const b = base(w);
    if (!WRAPPERS.has(b)) break;
    k++;
    while (k < words.length && words[k].startsWith('-')) {
      const opt = words[k++];
      if (VALUE_OPTS[b] && VALUE_OPTS[b].test(opt)) k++;
    }
    if (b === 'timeout' && k < words.length && /^\d/.test(words[k])) k++;
  }
  return { prog: base(words[k] || ''), args: words.slice(k + 1), words, outs };
}

// ---- Git ----

const R = {
  push: 'Agents never push. The capo pushes at the end, if the contract allows it.',
  noVerify: 'Agents never skip the git hooks (--no-verify, commit -n, -c core.hooksPath).',
  alias: 'Agents never define git aliases or config inline (-c alias.*, --config-env).',
  amend: 'Agents never amend: on a retry add a fix commit.',
  stash: 'Agents never stash: unsaved work can be lost. Commit, or stop with NEEDS_CONTEXT.',
  reset: 'Agents never reset --hard: it destroys work.',
  clean: 'Agents never run git clean -f: it deletes files.',
  checkout: 'Agents never switch branches or discard changes with git checkout: commit on the branch you are on.',
  restore: 'Agents never discard changes with git restore (only --staged is allowed).',
  merge: 'Agents never rebase, merge, pull or cherry-pick: the capo merges.',
  branch: 'Agents never create, delete, move or force branches: the capo manages branches.',
  refs: 'Agents never rewrite refs or history (update-ref, symbolic-ref, filter-branch, replace).',
  worktree: 'Agents never add, move or remove worktrees: the capo manages them.',
  reflog: 'Agents never expire or delete the reflog.',
  config: 'Agents never change the git configuration.',
  tag: 'Agents never create or delete tags.',
};

function gitRule(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i];
    if (/^--config-env(=|$)/.test(a)) return R.alias;
    if (['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--exec-path', '--list-cmds'].includes(a)) {
      const v = String(args[i + 1] || '');
      if (a === '-c' && /^core\.hookspath/i.test(v)) return R.noVerify;
      if (a === '-c' && /^alias\./i.test(v)) return R.alias;
      i += 2;
      continue;
    }
    i++;
  }
  const sub = String(args[i] || '').toLowerCase();
  const rest = args.slice(i + 1);
  const has = (re) => rest.some((x) => re.test(x));
  const short = (chars) => rest.some((x) => /^-[a-zA-Z]+$/.test(x) && [...x.slice(1)].some((ch) => chars.includes(ch)));
  const positional = rest.filter((x) => !x.startsWith('-'));
  if (has(/^--no-verify$/)) return R.noVerify;
  switch (sub) {
    case 'push':
    case 'send-pack':
    case 'http-push':
      return R.push;
    case 'commit':
      if (short('n')) return R.noVerify;
      if (has(/^--amend$/)) return R.amend;
      return null;
    case 'stash':
      return R.stash;
    case 'reset':
      return has(/^--(hard|merge|keep)$/) ? R.reset : null;
    case 'clean':
      return short('f') || has(/^--force$/) ? R.clean : null;
    case 'checkout':
    case 'switch':
      return R.checkout;
    case 'restore':
      return !has(/^(--staged|-S)$/) || has(/^(--worktree|-W)$/) ? R.restore : null;
    case 'rebase':
    case 'merge':
    case 'pull':
    case 'cherry-pick':
    case 'am':
      return R.merge;
    case 'branch': {
      const listing = has(/^(--list|-l|--contains|--no-contains|--merged|--no-merged|--points-at)$/);
      const changes = short('dDfmMcCu') || has(/^--(delete|force|move|copy|set-upstream-to.*|unset-upstream|edit-description)$/);
      return changes || (positional.length && !listing) ? R.branch : null;
    }
    case 'update-ref':
    case 'filter-branch':
    case 'filter-repo':
    case 'replace':
      return R.refs;
    case 'symbolic-ref':
      return positional.length >= 2 ? R.refs : null;
    case 'worktree':
      return (rest[0] || '') === 'list' ? null : R.worktree;
    case 'reflog':
      return /^(expire|delete)$/.test(rest[0] || '') ? R.reflog : null;
    case 'config': {
      if (/^(get|list)$/.test(rest[0] || '')) return null;
      if (/^(set|unset|rename-section|remove-section|edit)$/.test(rest[0] || '')) return R.config;
      if (has(/^--(get|get-all|get-regexp|get-urlmatch|list|show-origin|show-scope)$/) || has(/^-l$/)) return null;
      if (has(/^(--unset|--unset-all|--add|--replace-all|--rename-section|--remove-section|--edit|-e)$/)) return R.config;
      return positional.length >= 2 ? R.config : null;
    }
    case 'tag':
      return has(/^(-d|--delete|-f|--force)$/) || (positional.length && !has(/^(-l|--list|--contains|--points-at|--merged|--no-merged)$/))
        ? R.tag
        : null;
    default:
      return null;
  }
}

// ---- The factory's control files ----

const READERS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'wc', 'ls', 'stat', 'file', 'diff', 'cmp',
  'cut', 'uniq', 'jq', 'column', 'nl', 'tac', 'awk', 'test', '[', 'realpath', 'readlink', 'dirname', 'basename', 'echo',
  'printf', 'md5sum', 'sha1sum', 'sha256sum', 'git', 'get-content', 'select-string', 'get-childitem', 'test-path',
  'gc', 'type', 'sed', 'sort', 'find', 'tree', 'du',
]);

// Which files of .capo/ an agent may write: logs for all, reports for workers, checks for the inspector.
function capoKind(rel, agent) {
  if (/^(?:[\w.-]+\/)?logs(\/|$)/.test(rel)) return 'output';
  const m = rel.match(new RegExp('^(?:[\\w.-]+/)?task-' + TASK_ID + '-(r\\d+-report|r\\d+-checks|simplify-report)\\.md$', 'i'));
  if (m) {
    const checks = /checks$/.test(m[1]);
    if (checks && agent === 'inspector') return 'output';
    if (!checks && (agent === 'worker' || agent === 'simplifier')) return 'output';
  }
  return 'control';
}

function capoRefs(token, prefix) {
  const t = toPosix((prefix ? prefix + '/' : '') + token);
  const out = [];
  const re = /(?:^|[^\w.-])?\.capo\/([^\s'"`,;)]*)/g;
  let m;
  while ((m = re.exec(t))) out.push(m[1]);
  if (/(^|\/)\.capo\/?$/.test(t)) out.push('');
  return out;
}

function controlRule(cmd, agent, prefix) {
  const touches = (tokens) => tokens.some((t) => capoRefs(t, prefix).some((rel) => capoKind(rel, agent) === 'control'));
  if (cmd.outs.length && touches(cmd.outs)) return true;
  if (!touches(cmd.args) && !touches([cmd.prog])) return false;
  const p = cmd.prog;
  if (!READERS.has(p)) return true;
  if (p === 'sed' && cmd.args.some((a) => /^(-[a-zA-Z]*i|--in-place)/.test(a))) return true;
  if (p === 'sort' && cmd.args.some((a) => /^(-o|--output)/.test(a))) return true;
  if (p === 'find' && cmd.args.some((a) => /^-(delete|exec|execdir|ok|fprint)/.test(a))) return true;
  if (p === 'awk' && cmd.args.some((a) => /[^=!<>]>[^=]|system\(/.test(a))) return true;
  return false;
}

// ---- Reading a command, recursively through shells ----

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'busybox']);

function check(command, agent, depth = 0, ps = false) {
  if (depth > 3) return null;
  let prefix = null;
  for (const seg of lex(String(command).replace(/\r\n?/g, '\n'), ps)) {
    const cmd = commandOf(seg);
    if (cmd.prog === 'cd' || cmd.prog === 'pushd' || cmd.prog === 'set-location' || cmd.prog === 'sl') {
      prefix = cmd.args.find((a) => !a.startsWith('-')) || null;
      continue;
    }
    if (cmd.prog === 'git') {
      const r = gitRule(cmd.args);
      if (r) return r;
    }
    if (SHELLS.has(cmd.prog)) {
      const ci = cmd.args.findIndex((a) => /^-[a-zA-Z]*c$/.test(a));
      if (ci >= 0 && cmd.args[ci + 1] !== undefined) {
        const r = check(cmd.args[ci + 1], agent, depth + 1);
        if (r) return r;
      }
    }
    if (cmd.prog === 'eval') {
      const r = check(cmd.args.join(' '), agent, depth + 1);
      if (r) return r;
    }
    if (cmd.prog === 'pwsh' || cmd.prog === 'powershell') {
      if (cmd.args.some((a) => /^-e(nc(odedcommand)?)?$/i.test(a))) return 'Agents never run encoded PowerShell commands.';
      const ci = cmd.args.findIndex((a) => /^-c(ommand)?$/i.test(a));
      if (ci >= 0) {
        const r = check(cmd.args.slice(ci + 1).join(' '), agent, depth + 1, true);
        if (r) return r;
      }
    }
    if (controlRule(cmd, agent, prefix)) {
      return 'Agents never write the factory control files (ledger, scope, briefs, verify files); only their report, checks and logs.';
    }
  }
  return null;
}

if (require.main === module) {
  const input = readInput();
  const name = agentName(input);
  if (!name) process.exit(0);
  const command = String((input.tool_input && input.tool_input.command) || '');
  const reason = check(command, name, 0, input.tool_name === 'PowerShell');
  if (reason) deny(`Beltline wall (${name}): ${reason} If the task really needs it, stop with NEEDS_CONTEXT.`);
  process.exit(0);
}

module.exports = { lex, commandOf, gitRule, check };
