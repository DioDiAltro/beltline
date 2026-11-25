#!/usr/bin/env node
'use strict';
// PostToolUse in the main session, while a job is active: reads the size of the last request from the end of the
// transcript and, the first time it passes each step (150K, 250K, 400K, 600K tokens by default, or the steps in
// BELTLINE_CONTEXT_STEPS), adds one short note for the capo. Silent otherwise; never blocks.

const fs = require('fs');
const path = require('path');
const { readInput, mainRoot, capoDir, hasActive, activeJob, readTail, addContext } = require('./lib');

try {
  const input = readInput();
  if (input.agent_type || input.agent_id) process.exit(0); // subagents have their own windows
  if (!hasActive(input.cwd || process.cwd())) process.exit(0); // no job here: no git call, no cost
  const root = mainRoot(input.cwd || process.cwd());
  if (!root) process.exit(0);
  const job = activeJob(root);
  if (!job || !input.transcript_path) process.exit(0);
  const tp = String(input.transcript_path).replace(/^~(?=$|[\\/])/, require('os').homedir());

  let context = 0;
  const lines = readTail(tp, 256 * 1024).split('\n').reverse();
  for (const line of lines) {
    if (!line.includes('"usage"')) continue;
    try {
      const u = JSON.parse(line).message.usage;
      context = Number(u.input_tokens || 0) + Number(u.cache_read_input_tokens || 0) + Number(u.cache_creation_input_tokens || 0);
      break;
    } catch {
      // a partial line at the start of the tail
    }
  }
  if (!context) process.exit(0);

  const steps = String(process.env.BELTLINE_CONTEXT_STEPS || '150000,250000,400000,600000')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const file = path.join(capoDir(root), job, 'context-meter.json');
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    state = {};
  }
  const session = input.session_id || path.basename(tp, '.jsonl');
  if (state.session !== session) state = { session, done: [] };
  const step = steps.filter((x) => context >= x && !state.done.includes(x)).pop();
  if (!step) process.exit(0);
  state.done = steps.filter((x) => x <= step);
  fs.writeFileSync(file, JSON.stringify(state));
  addContext(
    'PostToolUse',
    `Beltline context meter: this conversation is at about ${Math.round(context / 1000)}K tokens, and every step ` +
      'rereads all of it. Make the ledger complete now, so a compaction or a fresh session loses nothing; from here ' +
      'read only status lines and first lines of files, and hand any other reading to an agent.'
  );
} catch {
  // the meter must never break the job
}
process.exit(0);
