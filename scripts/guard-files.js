#!/usr/bin/env node
'use strict';
// Wall: the kit's editing agents may change only the files of their own task, inside their own checkout. The task is
// read from the brief named in the agent's first message; its block in the scope file lists the files and the
// checkout (dir=). In .capo/ an agent may write only its report, its checks file and logs.

const path = require('path');
const {
  readInput, agentName, EDITING_AGENTS, TASK_ID, mainRoot, checkoutRoot, currentBranch, toPosix, samePath, inScope,
  readScopes, agentTask, deny,
} = require('./lib');

function capoOutput(rel, agent) {
  if (/^\.capo\/(?:[\w.-]+\/)?logs\/.+/.test(rel)) return true;
  const m = rel.match(new RegExp('^\\.capo/(?:[\\w.-]+/)?task-' + TASK_ID + '-(r\\d+-report|r\\d+-checks|simplify-report)\\.md$', 'i'));
  if (!m) return false;
  return /checks$/.test(m[1]) ? agent === 'inspector' : EDITING_AGENTS.includes(agent);
}

const input = readInput();
const name = agentName(input);
if (!name) process.exit(0);

const ti = input.tool_input || {};
const target = ti.file_path || ti.notebook_path || ti.path;
if (!target) process.exit(0);

const cwd = input.cwd || process.cwd();
const abs = path.resolve(cwd, target);
const root = mainRoot(cwd);
const checkout = checkoutRoot(abs) || root;
if (!root || !checkout) process.exit(0);

const rel = toPosix(path.relative(checkout, abs));
if (rel === '' || rel.startsWith('../') || rel === '..' || path.isAbsolute(rel)) {
  deny(`Beltline wall (${name}): ${target} is outside the repository. Stop with NEEDS_CONTEXT if the task needs it.`);
}

if (rel === '.capo' || rel.startsWith('.capo/')) {
  if (capoOutput(rel, name)) process.exit(0);
  deny(`Beltline wall (${name}): in .capo/ you may write only your report, checks file or logs, not ${rel}.`);
}

if (!EDITING_AGENTS.includes(name)) {
  deny(`Beltline wall (${name}): this agent may not edit project files (${rel}).`);
}

const scopes = readScopes(root);
if (scopes === null) process.exit(0); // no scope file: no job running with walls, nothing to enforce

const mine = agentTask(input);
let block = null;
if (mine) {
  block = scopes.blocks.find((b) => b.task === mine.task && (!mine.job || !b.job || b.job === mine.job)) || null;
}
if (!block) {
  // the brief is unknown (an agent started by hand): fall back to the branch of the checkout being edited
  const branch = currentBranch(checkout);
  block = scopes.blocks.find((b) => b.branch && b.branch === branch) || null;
}
const globs = (block ? block.globs : []).concat(scopes.loose);
if (!block && !scopes.loose.length) {
  deny(
    `Beltline wall (${name}): no scope block for ${mine ? 'task ' + mine.task : 'this branch'}. ` +
      'Stop with NEEDS_CONTEXT: the capo adds the block.'
  );
}
if (block && block.dir && !samePath(block.dir, checkout)) {
  deny(
    `Beltline wall (${name}): your checkout is ${block.dir}; ${abs} is in another one. ` +
      'Edit the copy under your checkout (absolute paths), or stop with NEEDS_CONTEXT.'
  );
}
if (!inScope(rel, globs)) {
  deny(
    `Beltline wall (${name}): ${rel} is outside the task scope (${globs.join(', ') || 'empty'}). ` +
      'Stop with NEEDS_CONTEXT and say which file you need and why.'
  );
}
process.exit(0);
