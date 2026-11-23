#!/usr/bin/env node
'use strict';
// Wall: the kit's editing agents may change only the files in the running tasks' scope (.capo/scope.txt in the main
// repository), may write their own reports in .capo/, and may never edit the factory control files.

const path = require('path');
const { readInput, agentName, EDITING_AGENTS, mainRoot, checkoutRoot, readScope, currentBranch, inScope, toPosix, deny } = require('./lib');

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
if (rel.startsWith('..')) {
  deny(`Beltline wall (${name}): ${target} is outside the repository. Stop with NEEDS_CONTEXT if the task needs it.`);
}

if (rel.startsWith('.capo/')) {
  if (/^\.capo\/task-\d+-(r\d+-report|simplify-report)\.md$/.test(rel) || /^\.capo\/[^/]*report[^/]*\.md$/.test(rel)) process.exit(0);
  deny(`Beltline wall (${name}): agents may write only their report in .capo/, not ${rel}.`);
}

if (!EDITING_AGENTS.includes(name)) {
  deny(`Beltline wall (${name}): this agent may not edit project files (${rel}).`);
}

const scope = readScope(root, currentBranch(checkout));
if (scope === null) process.exit(0); // no scope file: no job running with walls, nothing to enforce
if (!inScope(rel, scope)) {
  deny(
    `Beltline wall (${name}): ${rel} is outside the task scope (${scope.join(', ') || 'empty'}). ` +
      'Stop with NEEDS_CONTEXT and say which file you need and why.'
  );
}
process.exit(0);
