'use strict';
// Tests for the helper scripts: the cost report and the bite check. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { report, cost } = require('../scripts/costs.js');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const g = (dir, ...a) => execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...a], { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();

test('costs: list prices per model, last line per agent, capo included', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'costs-'));
  const row = (id, type, model, read, write, out, extra = {}) => JSON.stringify({ agent_id: id, agent_type: type, model, task: '1', input_tokens: 0, output_tokens: out, cache_read_input_tokens: read, cache_creation_input_tokens: write, ...extra });
  fs.writeFileSync(path.join(dir, 'costs.jsonl'), [
    row('a', 'worker', 'sonnet', 1e6, 1e6, 1e5),
    row('a', 'worker', 'sonnet', 2e6, 1e6, 1e5), // the same agent again: this line wins
    row('b', 'reviewer', 'claude-opus-5-5', 1e6, 0, 0),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'capo.json'), JSON.stringify({ sessions: { s: { agent_type: 'capo', agent_id: 's', model: 'claude-fable-5-2', output_tokens: 0, input_tokens: 0, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 0, context: 300000, state: { big: 1 } } } }));
  const r = report(dir);
  assert.strictEqual(r.agents, 2);
  assert.ok(r.capo);
  // sonnet: 2M reads × 0.10 + 1M writes × 2.50 + 0.1M out × 10 = 0.2 + 2.5 + 1 = 3.7; opus 1M reads × 0.20 = 0.2; capo fable 0.2
  assert.ok(Math.abs(r.total - 4.1) < 1e-9, String(r.total));
  assert.deepStrictEqual(r.biggest, ['capo 300K']);
  // Haiku over 100K tokens of prompt pays the long-context price
  const short = cost({ model: 'haiku', cache_read_input_tokens: 1e6, context: 50000 }).total;
  const long = cost({ model: 'haiku', cache_read_input_tokens: 1e6, context: 150000 }).total;
  assert.ok(long > short * 4);
  const out = spawnSync('node', [path.join(SCRIPTS, 'costs.js'), dir], { encoding: 'utf8' }).stdout;
  assert.match(out, /total \$4\.10 · 2 agents \+ capo/);
  assert.match(spawnSync('node', [path.join(SCRIPTS, 'costs.js'), dir, '--line'], { encoding: 'utf8' }).stdout, /^\$4\.10 at list prices/);
});

test('bite: new tests that fail on BASE bite, tests that pass there do not, and the checkout is removed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bite-'));
  g(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'sum.js'), 'module.exports = (a, b) => a - b;\n');
  g(dir, 'add', '-A'); g(dir, 'commit', '-qm', 'base');
  const base = g(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'sum.js'), 'module.exports = (a, b) => a + b;\n');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'marker.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'sum.test.js'), "require('marker.js'.replace('.js',''));\nif (require('./sum')(2, 2) !== 4) { console.error('expected 4'); process.exit(1); }\n");
  fs.writeFileSync(path.join(dir, 'weak.test.js'), 'process.exit(0);\n');
  const log = path.join(dir, 'logs', 'bite.log');
  const bite = (files) => JSON.parse(spawnSync('node', [path.join(SCRIPTS, 'bite.js'), '--base', base, '--dir', dir, '--files', files, '--log', log, '--cmd', 'node {files}'], { encoding: 'utf8' }).stdout);
  const r1 = bite('sum.test.js');
  assert.strictEqual(r1.bites, true, JSON.stringify(r1));
  assert.match(fs.readFileSync(log, 'utf8'), /expected 4/, 'fails for the code, not for a missing module');
  const r2 = bite('weak.test.js');
  assert.strictEqual(r2.bites, false);
  assert.strictEqual(g(dir, 'worktree', 'list').split('\n').length, 1, 'the temporary checkout is gone');
  assert.ok(fs.existsSync(path.join(dir, 'node_modules', 'marker.js')), 'the real dependencies are untouched');
});
