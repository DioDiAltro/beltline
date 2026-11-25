#!/usr/bin/env node
'use strict';
// Meter for the capo itself: at the end of each turn of the main session, while a job is active (.capo/active), it
// reads what the session transcript added since the last turn and keeps the session's totals, its current context
// size and its largest tool results in .capo/<job>/capo.json. Never blocks.

const fs = require('fs');
const path = require('path');
const { readInput, mainRoot, capoDir, hasActive, activeJob, scanTranscript, totalsOf } = require('./lib');

try {
  const input = readInput();
  if (input.agent_type || input.agent_id) process.exit(0); // only the main session
  if (!hasActive(input.cwd || process.cwd())) process.exit(0); // no job here: no git call, no cost
  const root = mainRoot(input.cwd || process.cwd());
  if (!root) process.exit(0);
  const job = activeJob(root);
  if (!job || !input.transcript_path) process.exit(0);
  const tp = String(input.transcript_path).replace(/^~(?=$|[\\/])/, require('os').homedir());
  if (!fs.existsSync(tp)) process.exit(0);

  const file = path.join(capoDir(root), job, 'capo.json');
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = {};
  }
  data.sessions = data.sessions || {};
  const id = input.session_id || path.basename(tp, '.jsonl');
  const prev = data.sessions[id] || {};
  const state = prev.state && prev.state.transcript === tp ? prev.state : { transcript: tp };
  scanTranscript(tp, state);
  state.calls = {}; // pending tool calls are not worth keeping between turns
  delete state.firstUser; // only subagents need their first message
  data.sessions[id] = {
    time: new Date().toISOString(),
    job,
    agent_type: 'capo',
    agent_id: id,
    model: state.model || null,
    ...totalsOf(state),
    context: state.context || 0,
    top: (state.top || []).slice(0, 5),
    state,
  };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
} catch {
  // the meter must never break the job
}
process.exit(0);
