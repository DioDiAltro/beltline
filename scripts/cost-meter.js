#!/usr/bin/env node
'use strict';
// Meter: when a kit agent finishes, append its model, token totals, last context size and largest tool results to
// .capo/<job>/costs.jsonl (the job named in its brief, or the active one). Append-only: a later stop of the same agent
// adds a newer line, and readers keep the last line per agent. Only when .capo/ exists; never blocks.

const fs = require('fs');
const path = require('path');
const { readInput, agentName, mainRoot, capoDir, activeJob, agentTranscript, briefOf, scanTranscript, totalsOf } = require('./lib');

try {
  const input = readInput();
  const name = agentName(input);
  if (!name) process.exit(0);

  const root = mainRoot(input.cwd || process.cwd());
  if (!root) process.exit(0);
  const capo = capoDir(root);
  if (!fs.existsSync(capo)) process.exit(0);

  const tp = agentTranscript(input);
  const s = tp && fs.existsSync(tp) ? scanTranscript(tp) : {};
  const brief = briefOf(s.firstUser || '') || {};
  let job = brief.job && fs.existsSync(path.join(capo, brief.job)) ? brief.job : activeJob(root);
  const dir = job ? path.join(capo, job) : capo;

  const row = {
    time: new Date().toISOString(),
    job: job || null,
    agent_type: name,
    agent_id: input.agent_id || null,
    task: brief.task || null,
    round: brief.round || null,
    model: s.model || null,
    ...(s.totals ? totalsOf(s) : { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
    context: s.context || 0,
    top: (s.top || []).slice(0, 3),
  };
  fs.appendFileSync(path.join(dir, 'costs.jsonl'), JSON.stringify(row) + '\n');
} catch {
  // the meter must never break the job
}
process.exit(0);
