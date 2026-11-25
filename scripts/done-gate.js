#!/usr/bin/env node
'use strict';
// Wall: a worker or simplifier cannot stop with DONE unless it ends with the status line and its report has a
// "## Checks" section with at least one command; the inspector cannot stop without its result line and checks file.
// Asks once; if the agent still cannot comply, it lets it stop (stop_hook_active) and verify will catch it.

const fs = require('fs');
const path = require('path');
const { readInput, agentName, EDITING_AGENTS, mainRoot, block } = require('./lib');

const input = readInput();
const name = agentName(input);
if (!name || (!EDITING_AGENTS.includes(name) && name !== 'inspector')) process.exit(0);
if (input.stop_hook_active) process.exit(0);

// Tolerate markdown the model may add (bold, code) around the labels.
const msg = String(input.last_assistant_message || '').replace(/[*`]/g, '');
const reportPath = ((msg.match(/^\s*REPORT:\s*(.+?)\s*$/m) || [])[1] || '').replace(/^["']|["']$/g, '');

function findReport() {
  if (!reportPath) return null;
  const cwd = input.cwd || process.cwd();
  const candidates = [path.resolve(cwd, reportPath)];
  const root = mainRoot(cwd);
  if (root) candidates.push(path.resolve(root, reportPath));
  return candidates.find((p) => fs.existsSync(p)) || null;
}

if (name === 'inspector') {
  if (!/^\s*RESULT:\s*(GREEN|RED)\b/m.test(msg)) {
    block('Beltline: end with "RESULT: GREEN | RED", then "REPORT: <path of the checks file>" and "RED: <count>".');
  }
  if (!reportPath) block('Beltline: the result needs "REPORT: <path of the checks file>".');
  if (!findReport()) block(`Beltline: the checks file ${reportPath} does not exist. Write it before answering.`);
  process.exit(0);
}

const status = (msg.match(/STATUS:\s*(DONE_WITH_CONCERNS|DONE|NEEDS_CONTEXT|BLOCKED)\b/) || [])[1];
if (!status) {
  block(
    'Beltline: end with the status block: "STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED", ' +
      'then "REPORT: <path>", "COMMIT: <hash or none>", "CHECKS: <one line>".'
  );
}
if (status === 'NEEDS_CONTEXT' || status === 'BLOCKED') process.exit(0);

if (!reportPath) block('Beltline: a DONE needs "REPORT: <path of your report>".');
const found = findReport();
if (!found) block(`Beltline: the report ${reportPath} does not exist. Write it before saying DONE.`);

const text = fs.readFileSync(found, 'utf8');
const checks = text.split(/^##\s+Checks\s*$/im)[1];
if (checks === undefined) {
  block(`Beltline: ${reportPath} has no "## Checks" section. Add the commands you ran with exit codes and output.`);
}
const section = checks.split(/^##\s/m)[0];
if (!/```|`[^`]+`|\$ |exit/i.test(section)) {
  block(`Beltline: the "## Checks" section of ${reportPath} has no command. Copy each command with its result.`);
}
process.exit(0);
