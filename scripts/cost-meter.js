#!/usr/bin/env node
'use strict';
// Meter: when a kit agent finishes, append its model and token totals to .capo/costs.jsonl in the main repository.
// Only when .capo/ already exists (a capo job is running); never creates folders in other projects. Never blocks.

const fs = require('fs');
const path = require('path');
const { readInput, agentName, mainRoot } = require('./lib');

try {
  const input = readInput();
  const name = agentName(input);
  if (!name) process.exit(0);

  const root = mainRoot(input.cwd || process.cwd());
  if (!root) process.exit(0);
  const dir = path.join(root, '.capo');
  if (!fs.existsSync(dir)) process.exit(0);

  const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let model = null;
  let task = null;
  let round = null;
  const seen = new Set();
  const tp = input.agent_transcript_path ? String(input.agent_transcript_path).replace(/^~/, require('os').homedir()) : null;
  if (tp && fs.existsSync(tp)) {
    for (const line of fs.readFileSync(tp, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const m = obj && obj.message;
      if (task === null && m && m.role === 'user') {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
        const t = text.match(/task-(\d+)/);
        const r = text.match(/task-\d+-r(\d+)-report/);
        if (t) task = Number(t[1]);
        if (r) round = Number(r[1]);
      }
      if (!m || !m.usage) continue;
      const key = m.id || obj.uuid;
      if (key && seen.has(key)) continue; // a message can appear in several lines while streaming
      if (key) seen.add(key);
      if (m.model) model = m.model;
      for (const k of Object.keys(totals)) totals[k] += Number(m.usage[k] || 0);
    }
  }

  const row = { time: new Date().toISOString(), agent_type: name, agent_id: input.agent_id || null, task, round, model, ...totals };
  // The transcript holds the agent's whole life, so a later stop of the same agent (after a retry or a block) carries
  // the full totals: replace its earlier line instead of adding one, or every resumed agent would be counted twice.
  const file = path.join(dir, 'costs.jsonl');
  let lines = [];
  if (fs.existsSync(file)) lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  if (row.agent_id) {
    lines = lines.filter((l) => {
      try {
        return JSON.parse(l).agent_id !== row.agent_id;
      } catch {
        return true;
      }
    });
  }
  lines.push(JSON.stringify(row));
  fs.writeFileSync(file, lines.join('\n') + '\n');
} catch {
  // the meter must never break the job
}
process.exit(0);
