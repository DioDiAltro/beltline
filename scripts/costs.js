#!/usr/bin/env node
'use strict';
// Cost report of a job: reads .capo/<job>/costs.jsonl (one line per agent stop, the last line per agent wins) and
// .capo/<job>/capo.json (the main session), and prints a short summary. Prices are list prices per million tokens,
// with 5-minute cache writes: a yardstick to compare tasks and models, not a bill (plans count usage, not dollars).
// Usage: node costs.js <.capo/<job> | costs.jsonl> [--json | --line]

const fs = require('fs');
const path = require('path');

// USD per million tokens, list prices of November 2026: input, output, cache write (5 min), cache read.
const PRICES = {
  fable: { i: 8, o: 40, w: 10, r: 0.2 },
  opus: { i: 4, o: 20, w: 5, r: 0.2 },
  sonnet: { i: 2, o: 10, w: 2.5, r: 0.1 },
  haiku: { i: 0.1, o: 0.5, w: 0.125, r: 0.01 },
  haikuLong: { i: 0.5, o: 2.5, w: 0.625, r: 0.05 }, // Haiku 5.5 prompts over 100K tokens
};

function family(model) {
  const m = String(model || '').toLowerCase();
  if (/fable|mythos/.test(m)) return 'fable';
  if (/opus/.test(m)) return 'opus';
  if (/haiku/.test(m)) return 'haiku';
  if (/sonnet/.test(m)) return 'sonnet';
  return 'sonnet';
}

function cost(row) {
  let f = family(row.model);
  if (f === 'haiku' && Number(row.context) > 100000) f = 'haikuLong';
  const p = PRICES[f];
  const parts = {
    write: (Number(row.cache_creation_input_tokens) || 0) * p.w,
    read: (Number(row.cache_read_input_tokens) || 0) * p.r,
    output: (Number(row.output_tokens) || 0) * p.o,
    input: (Number(row.input_tokens) || 0) * p.i,
  };
  for (const k of Object.keys(parts)) parts[k] /= 1e6;
  return { total: parts.write + parts.read + parts.output + parts.input, parts };
}

function load(target) {
  let dir = target;
  let file = target;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) file = path.join(target, 'costs.jsonl');
  else dir = path.dirname(target);
  const last = new Map();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const x = JSON.parse(line);
        last.set(x.agent_id || `${x.time}-${Math.random()}`, x);
      } catch {
        // skip a broken line
      }
    }
  }
  const rows = [...last.values()];
  const capoFile = path.join(dir, 'capo.json');
  if (fs.existsSync(capoFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(capoFile, 'utf8'));
      for (const s of Object.values(data.sessions || {})) {
        const { state, ...row } = s;
        rows.push(row);
      }
    } catch {
      // skip
    }
  }
  return rows;
}

function report(target) {
  const rows = load(target).map((r) => ({ ...r, cost: cost(r) }));
  const sum = (list) => list.reduce((a, r) => a + r.cost.total, 0);
  const group = (key) => {
    const g = {};
    for (const r of rows) {
      const k = key(r);
      g[k] = g[k] || { cost: 0, n: 0 };
      g[k].cost += r.cost.total;
      g[k].n++;
    }
    return Object.entries(g).sort((a, b) => b[1].cost - a[1].cost);
  };
  const parts = { write: 0, read: 0, output: 0, input: 0 };
  for (const r of rows) for (const k of Object.keys(parts)) parts[k] += r.cost.parts[k];
  const total = sum(rows);
  const top = [];
  for (const r of rows) for (const t of r.top || []) top.push({ who: r.agent_type === 'capo' ? 'capo' : `task ${r.task || '?'} ${r.agent_type}`, ...t });
  top.sort((a, b) => b.tokens - a.tokens);
  const biggest = rows
    .filter((r) => r.context)
    .sort((a, b) => b.context - a.context)
    .slice(0, 3)
    .map((r) => `${r.agent_type === 'capo' ? 'capo' : `task ${r.task || '?'} ${r.agent_type}`} ${Math.round(r.context / 1000)}K`);
  return {
    job: rows.find((r) => r.job)?.job || path.basename(path.resolve(target)),
    total,
    agents: rows.filter((r) => r.agent_type !== 'capo').length,
    capo: rows.some((r) => r.agent_type === 'capo'),
    parts,
    byModel: group((r) => family(r.model) + (r.agent_type === 'capo' ? ' (capo)' : '')),
    byAgent: group((r) => r.agent_type),
    byTask: group((r) => (r.agent_type === 'capo' ? 'capo' : String(r.task || '?'))),
    biggest,
    top: top.slice(0, 5),
  };
}

const $ = (x) => '$' + x.toFixed(x < 10 ? 2 : 1);
const pct = (x, t) => (t ? Math.round((100 * x) / t) : 0) + '%';
const list = (g, n = 6) => g.slice(0, n).map(([k, v]) => `${k} ${$(v.cost)} (${v.n})`).join(' · ');

if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    process.stderr.write('usage: node costs.js <.capo/<job> | costs.jsonl> [--json | --line]\n');
    process.exit(2);
  }
  const r = report(target);
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  } else if (args.includes('--line')) {
    process.stdout.write(`${$(r.total)} at list prices, ${r.agents} agents${r.capo ? ' + capo' : ''}${r.biggest[0] ? ', largest context ' + r.biggest[0] : ''}\n`);
  } else {
    const out = [
      `Beltline costs — job ${r.job} (list prices, 5-minute cache writes: a yardstick, not a bill)`,
      `total ${$(r.total)} · ${r.agents} agents${r.capo ? ' + capo' : ' (capo not measured)'} · cache writes ${pct(r.parts.write, r.total)} · cache reads ${pct(r.parts.read, r.total)} · output ${pct(r.parts.output, r.total)}`,
      `by model: ${list(r.byModel)}`,
      `by agent: ${list(r.byAgent)}`,
      `by task: ${list(r.byTask, 8)}`,
    ];
    if (r.biggest.length) out.push(`largest contexts: ${r.biggest.join(' · ')}`);
    if (r.top.length) out.push(`largest tool results: ${r.top.map((t) => `${t.who}: ${t.what} ${Math.round(t.tokens / 1000)}K`).join(' · ')}`);
    process.stdout.write(out.join('\n') + '\n');
  }
}

module.exports = { report, cost, family, PRICES, load };
