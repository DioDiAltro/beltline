#!/usr/bin/env node
'use strict';
// SessionStart: when a Beltline job is active in this repository, tell the session where its state is. After a
// compaction or a resume this is what lets the capo continue from the ledger instead of from a lossy summary.

const fs = require('fs');
const path = require('path');
const { readInput, mainRoot, capoDir, hasActive, activeJob, addContext } = require('./lib');

try {
  const input = readInput();
  if (input.agent_type) process.exit(0);
  if (!hasActive(input.cwd || process.cwd())) process.exit(0); // no job here: no git call, no cost
  const root = mainRoot(input.cwd || process.cwd());
  if (!root) process.exit(0);
  const job = activeJob(root);
  if (!job) process.exit(0);
  const ledger = path.join(capoDir(root), job, 'ledger.md');
  if (!fs.existsSync(ledger)) process.exit(0);
  const rel = `.capo/${job}/ledger.md`;
  const source = String(input.source || 'startup');
  if (source === 'startup') {
    addContext(
      'SessionStart',
      `Beltline: job ${job} is active in this repository (${rel}). If the user says "resume the job", follow beltline:ledger → Resume.`
    );
  }
  addContext(
    'SessionStart',
    `Beltline: job ${job} is running and its state is on disk. Before anything else read ${rel} (header, task table, ` +
      'last decisions) and continue as beltline:ledger → Resume says, in the mode the contract sets. Never redo a task ' +
      'marked done; earlier details are in the reports and logs of the job folder (search them, do not reread them).'
  );
} catch {
  // never break a session start
}
process.exit(0);
