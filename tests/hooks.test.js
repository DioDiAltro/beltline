'use strict';
// Tests for the Beltline walls. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const SCRIPTS = path.join(__dirname, '..', 'scripts');

function run(script, input) {
  const r = spawnSync('node', [path.join(SCRIPTS, script)], { input: JSON.stringify(input), encoding: 'utf8' });
  let out = null;
  try { out = r.stdout ? JSON.parse(r.stdout) : null; } catch { out = r.stdout; }
  return { code: r.status, out, stderr: r.stderr };
}
const denied = (r) => r.out && r.out.hookSpecificOutput && r.out.hookSpecificOutput.permissionDecision === 'deny';
const blocked = (r) => r.out && r.out.decision === 'block';

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beltline-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  fs.mkdirSync(path.join(dir, '.capo'));
  return dir;
}

// guard-bash
const bash = (cmd, agent = 'beltline:worker') => run('guard-bash.js', { agent_type: agent, tool_input: { command: cmd } });

test('guard-bash blocks dangerous git for kit agents', () => {
  for (const c of ['git push', 'git push origin main', 'git commit --no-verify -m x', 'git commit -nm x',
    'git stash', 'git reset --hard HEAD~1', 'git clean -fd', 'git checkout -- src/a.js', 'git checkout .',
    'git restore src/a.js', 'git rebase main', 'git merge other', 'cd x && git push',
    'git -C sub push', 'git switch main', 'git checkout main', 'git checkout -b feature']) {
    assert.ok(denied(bash(c)), c);
  }
});
test('guard-bash allows normal work', () => {
  for (const c of ['git status', 'git commit -m "add x"', 'git add -A', 'git diff HEAD', 'npm test',
    'git restore --staged a.js', 'cat .capo/task-1.md', 'grep -n x .capo/ledger.md', 'git log --oneline',
    'echo hi > .capo/task-1-r1-report.md', 'git commit -m "merge filters, push button, stash list"',
    'git merge-base HEAD main', 'git log --no-merges', 'npm run push-docs']) {
    assert.ok(!denied(bash(c)), c);
  }
});
test('guard-bash blocks writing control files', () => {
  for (const c of ['echo x > .capo/scope.txt', 'echo x >> .capo/ledger.md', 'sed -i s/a/b/ .capo/task-2.md',
    'rm .capo/scope.txt', 'echo "**" | tee .capo/scope.txt', 'cp other .capo/scope.txt']) {
    assert.ok(denied(bash(c)), c);
  }
});
test('guard-bash ignores user, main session and other plugins', () => {
  assert.ok(!denied(run('guard-bash.js', { tool_input: { command: 'git push' } })));
  assert.ok(!denied(bash('git push', 'other:worker')));
  assert.ok(!denied(bash('git push', 'Explore')));
  assert.ok(!denied(bash('git push', 'beltline:foreman')), 'not a kit agent any more');
});

// guard-files
test('guard-files enforces scope for workers', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, '.capo', 'scope.txt'), 'src/a/**\nREADME.md\n# comment\nlib/x.js\n');
  const edit = (f, agent = 'beltline:worker') => run('guard-files.js', { agent_type: agent, cwd: dir, tool_input: { file_path: f } });
  assert.ok(!denied(edit(path.join(dir, 'src/a/b/c.ts'))));
  assert.ok(!denied(edit('README.md')));
  assert.ok(!denied(edit('lib/x.js')));
  assert.ok(denied(edit('lib/y.js')));
  assert.ok(denied(edit(path.join(dir, 'src/b.ts'))));
  assert.ok(denied(edit('.capo/scope.txt')));
  assert.ok(denied(edit('.capo/ledger.md')));
  assert.ok(!denied(edit('.capo/task-3-r1-report.md')));
  assert.ok(!denied(edit('.capo/task-3-simplify-report.md')));
  assert.ok(denied(edit('.capo/task-3.md')));
  assert.ok(denied(edit('/etc/passwd')));
  assert.ok(denied(edit('src/a/x.ts', 'beltline:reviewer')));
  assert.ok(!denied(edit('lib/y.js', 'Explore')));

});
test('guard-files allows everything in the repo without a scope file', () => {
  const dir = repo();
  const r = run('guard-files.js', { agent_type: 'beltline:worker', cwd: dir, tool_input: { file_path: 'any/file.js' } });
  assert.ok(!denied(r));
});
test('guard-files works from a worktree with the main scope', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, '.capo', 'scope.txt'), '# task 1 branch=w1\nsrc/**\n# task 2 branch=w2\nlib/**\n');
  const wt = path.join(os.tmpdir(), 'beltline-wt-' + Date.now());
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'w1', wt], { cwd: dir });
  const edit = (f) => run('guard-files.js', { agent_type: 'beltline:worker', cwd: wt, tool_input: { file_path: f } });
  assert.ok(!denied(edit(path.join(wt, 'src/x.js'))));
  assert.ok(denied(edit(path.join(wt, 'lib/x.js'))), 'other task block');
  assert.ok(denied(edit(path.join(wt, 'other.js'))));
  // the report goes to the main .capo by absolute path
  assert.ok(!denied(edit(path.join(dir, '.capo', 'task-1-r2-report.md'))));
  // a branch without a block falls back to the union
  const main = (f) => run('guard-files.js', { agent_type: 'beltline:worker', cwd: dir, tool_input: { file_path: f } });
  assert.ok(!denied(main('lib/x.js')));
});

// done-gate
test('done-gate requires status and a report with checks', () => {
  const dir = repo();
  const stop = (msg, extra = {}) => run('done-gate.js', { agent_type: 'beltline:worker', cwd: dir, last_assistant_message: msg, ...extra });
  assert.ok(blocked(stop('All done!')));
  assert.ok(!blocked(stop('STATUS: NEEDS_CONTEXT\nneed file x')));
  assert.ok(blocked(stop('STATUS: DONE\nREPORT: .capo/task-1-report.md')));
  fs.writeFileSync(path.join(dir, '.capo/task-1-report.md'), '# Task 1\nDid it.\n');
  assert.ok(blocked(stop('STATUS: DONE\nREPORT: .capo/task-1-report.md')));
  fs.writeFileSync(path.join(dir, '.capo/task-1-report.md'), '# Task 1\n## Checks\nlooked fine\n## Doubts\n');
  assert.ok(blocked(stop('STATUS: DONE\nREPORT: .capo/task-1-report.md')));
  fs.writeFileSync(path.join(dir, '.capo/task-1-report.md'), '# Task 1\n## Checks\n```\n$ npm test\nexit 0\n```\n');
  assert.ok(!blocked(stop('STATUS: DONE_WITH_CONCERNS\nREPORT: .capo/task-1-report.md\nCOMMIT: abc')));
  assert.ok(!blocked(stop('**STATUS:** DONE\n**REPORT:** `.capo/task-1-report.md`')));
  assert.ok(!blocked(stop('STATUS: DONE\nREPORT: ' + path.join(dir, '.capo/task-1-report.md'), { cwd: os.tmpdir() })));
  assert.ok(!blocked(stop('All done!', { stop_hook_active: true })));
  assert.ok(!blocked(run('done-gate.js', { agent_type: 'beltline:scout', cwd: dir, last_assistant_message: 'x' })));
});

// cost-meter
test('cost-meter sums usage once per message, only with .capo', () => {
  const dir = repo();
  const tp = path.join(dir, 't.jsonl');
  const u = (id, i, o) => JSON.stringify({ message: { id, model: 'claude-haiku', usage: { input_tokens: i, output_tokens: o, cache_read_input_tokens: 1 } } });
  const first = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Brief: /r/.capo/task-7.md report /r/.capo/task-7-r2-report.md' }] } });
  fs.writeFileSync(tp, [first, u('m1', 10, 5), u('m1', 10, 5), u('m2', 20, 7), 'not json', ''].join('\n'));
  run('cost-meter.js', { agent_type: 'beltline:worker', cwd: dir, agent_transcript_path: tp, agent_id: 'a1' });
  const row = JSON.parse(fs.readFileSync(path.join(dir, '.capo/costs.jsonl'), 'utf8').trim());
  assert.strictEqual(row.input_tokens, 30);
  assert.strictEqual(row.output_tokens, 12);
  assert.strictEqual(row.cache_read_input_tokens, 2);
  assert.strictEqual(row.model, 'claude-haiku');
  assert.strictEqual(row.task, 7);
  assert.strictEqual(row.round, 2);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'nocapo-'));
  execFileSync('git', ['init', '-q'], { cwd: other });
  const r = run('cost-meter.js', { agent_type: 'beltline:worker', cwd: other, agent_transcript_path: tp });
  assert.strictEqual(r.code, 0);
  assert.ok(!fs.existsSync(path.join(other, '.capo')));
});
