'use strict';
// Tests for the Beltline walls and meters. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const SCRIPTS = path.join(__dirname, '..', 'scripts');

function run(script, input, env = {}) {
  const r = spawnSync('node', [path.join(SCRIPTS, script)], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env } });
  let out = null;
  try { out = r.stdout ? JSON.parse(r.stdout) : null; } catch { out = r.stdout; }
  return { code: r.status, out, stderr: r.stderr };
}
const denied = (r) => r.out && r.out.hookSpecificOutput && r.out.hookSpecificOutput.permissionDecision === 'deny';
const blocked = (r) => r.out && r.out.decision === 'block';
const context = (r) => (r.out && r.out.hookSpecificOutput && r.out.hookSpecificOutput.additionalContext) || '';
const g = (dir, ...a) => execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...a], { cwd: dir, stdio: 'pipe' });

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beltline-'));
  g(dir, 'init', '-q', '-b', 'main');
  g(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  fs.mkdirSync(path.join(dir, '.capo'));
  return dir;
}

// A fake session: the main transcript and the subagent transcript whose first message names the brief.
function session(dir, agentId, prompt) {
  const sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'beltline-session-'));
  const main = path.join(sessions, 'sess1.jsonl');
  fs.writeFileSync(main, '');
  const sub = path.join(sessions, 'sess1', 'subagents');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, `agent-${agentId}.jsonl`), JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } }) + '\n');
  return main;
}

// ---- guard-bash ----
const bash = (cmd, agent = 'beltline:worker') => run('guard-bash.js', { agent_type: agent, tool_input: { command: cmd } });

test('guard-bash blocks dangerous git for kit agents', () => {
  for (const c of ['git push', 'git push origin main', 'git commit --no-verify -m x', 'git commit -nm x',
    'git stash', 'git stash list', 'git reset --hard HEAD~1', 'git clean -fd', 'git checkout -- src/a.js', 'git checkout .',
    'git restore src/a.js', 'git restore --staged --worktree a.js', 'git rebase main', 'git merge other', 'git pull',
    'git cherry-pick abc', 'cd x && git push', 'git -C sub push', 'git switch main', 'git checkout main',
    'git checkout -b feature', 'git commit --amend --no-edit', 'git branch -D t2', 'git branch -f prova HEAD',
    'git branch new-branch', 'git update-ref refs/heads/prova HEAD', 'git worktree remove --force ../wt2',
    'git worktree add ../x', 'git reflog expire --all', 'git config core.hooksPath /dev/null', 'git config set a.b c',
    'git tag -d v1', 'git -c core.hooksPath=/dev/null commit -m x', 'git -c alias.p=push p', 'git --config-env=a=B status']) {
    assert.ok(denied(bash(c)), c);
  }
});
test('guard-bash sees through lines, variables, wrappers and nested shells', () => {
  for (const c of ['npm test\ngit push', 'GIT_EDITOR=true git rebase --continue', 'GIT_TERMINAL_PROMPT=0 git push origin prova',
    'bash -c "git push"', "sh -c 'git reset --hard HEAD~1'", 'bash -lc "cd a && git push"', '/usr/bin/git push',
    'command git push', 'time git push', 'env -u X git push', 'sudo -u me git push', 'nohup git push &', 'timeout 5 git push',
    'echo $(git push)', '`git push`', 'eval "git push"', 'x=1; y=2 git stash', 'npm test || git push --force',
    'pwsh -Command "git push"', 'powershell -EncodedCommand ZwBpAHQA', 'C:/Git/bin/git.exe push', '( git push )',
    'xargs -n1 git push < list.txt']) {
    assert.ok(denied(bash(c)), c);
  }
});
test('guard-bash reads PowerShell commands with backslash paths', () => {
  const ps = (cmd) => run('guard-bash.js', { agent_type: 'beltline:worker', tool_name: 'PowerShell', tool_input: { command: cmd } });
  for (const c of ['C:\\Git\\bin\\git.exe push', 'git push; Write-Host ok', '& git stash', 'Set-Content .capo\\j\\scope.txt "**"']) assert.ok(denied(ps(c)), c);
  for (const c of ['git status', 'Get-Content .capo\\j\\ledger.md', 'npm test *> .capo\\j\\logs\\t.log']) assert.ok(!denied(ps(c)), c);
});
test('guard-bash allows normal work', () => {
  for (const c of ['git status', 'git commit -m "add x"', 'git add -A', 'git diff HEAD', 'npm test',
    'git restore --staged a.js', 'cat .capo/task-1.md', 'grep -n x .capo/ledger.md', 'git log --oneline',
    'echo hi > .capo/task-1-r1-report.md', 'git commit -m "merge filters, push button, stash list"',
    'git merge-base HEAD main', 'git log --no-merges', 'npm run push-docs', 'git branch', 'git branch -a',
    'git branch --show-current', 'git branch --contains abc', 'git worktree list', 'git config --get user.name',
    'git config user.name', 'git tag', 'git tag -l "v*"', 'git fetch', 'git rev-parse HEAD', 'git show HEAD:a.js',
    'npm test > /r/.capo/2026-11-25-x/logs/task-1-r1-tests.log 2>&1; echo "exit=$?"',
    'echo x > /r/.capo/2026-11-25-x/task-8a-r2-report.md', 'sed -n 1,5p .capo/2026-11-25-x/ledger.md', 'ls .capo',
    'tail -n 30 .capo/2026-11-25-x/logs/a.log', 'cat > notes.md <<\'EOF\'\ngit push\nEOF',
    'git commit -m "$(cat <<\'EOF\'\nmerge the push path\nEOF\n)"', 'echo "git push" | wc -c', "git commit -m 'stash and push'"]) {
    assert.ok(!denied(bash(c)), c);
  }
});
test('guard-bash blocks writing control files, also from scripts', () => {
  for (const c of ['echo x > .capo/scope.txt', 'echo x >> .capo/ledger.md', 'sed -i s/a/b/ .capo/task-2.md',
    'rm .capo/scope.txt', 'echo "**" | tee .capo/scope.txt', 'cp other .capo/scope.txt',
    'echo x > /r/.capo/2026-11-25-x/scope.txt', 'node -e "require(\'fs\').writeFileSync(\'.capo/j/scope.txt\',\'**\')"',
    'python3 -c "open(\'.capo/j/ledger.md\',\'w\')"', 'cd .capo/j && echo x > ledger.md', 'rm -rf .capo',
    'echo x > .capo/j/task-1-r1-verify.md', 'echo x > .capo/j/task-1-r1-checks.md', 'Set-Content .capo/j/scope.txt "**"']) {
    assert.ok(denied(bash(c)), c);
  }
  // the inspector writes its checks file, not reports
  assert.ok(!denied(bash('echo x > .capo/j/task-1-r1-checks.md', 'beltline:inspector')));
  assert.ok(denied(bash('echo x > .capo/j/task-1-r1-report.md', 'beltline:inspector')));
  // read-only agents write nothing in .capo/ but logs
  assert.ok(denied(bash('echo x > .capo/j/task-1-r1-report.md', 'beltline:reviewer')));
  assert.ok(!denied(bash('npm test > .capo/j/logs/r.log 2>&1', 'beltline:reviewer')));
});
test('guard-bash ignores user, main session and other plugins', () => {
  assert.ok(!denied(run('guard-bash.js', { tool_input: { command: 'git push' } })));
  assert.ok(!denied(bash('git push', 'other:worker')));
  assert.ok(!denied(bash('git push', 'Explore')));
  assert.ok(!denied(bash('git push', 'beltline:foreman')), 'not a kit agent any more');
});

// ---- guard-files ----
test('guard-files enforces scope for workers (0.2 flat scope file)', () => {
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
  assert.ok(denied(edit('src/a/x.ts', 'beltline:inspector')));
  assert.ok(!denied(edit('lib/y.js', 'Explore')));
});
test('guard-files allows everything in the repo without a scope file', () => {
  const dir = repo();
  const r = run('guard-files.js', { agent_type: 'beltline:worker', cwd: dir, tool_input: { file_path: 'any/file.js' } });
  assert.ok(!denied(r));
});
test('guard-files keeps each parallel worker in its own task and its own worktree', () => {
  const dir = repo();
  const job = '2026-11-25-x';
  const wt1 = path.join(os.tmpdir(), 'beltline-wt1-' + Date.now());
  const wt2 = path.join(os.tmpdir(), 'beltline-wt2-' + Date.now());
  g(dir, 'worktree', 'add', '-q', '-b', 'j/t1', wt1);
  g(dir, 'worktree', 'add', '-q', '-b', 'j/t2', wt2);
  fs.mkdirSync(path.join(dir, '.capo', job), { recursive: true });
  fs.writeFileSync(path.join(dir, '.capo', job, 'scope.txt'), `# task 1 branch=j/t1 dir=${wt1}\nsrc/**\n# task 2 branch=j/t2 dir=${wt2}\nlib/**\n`);
  const main = session(dir, 'a1', `Read the brief ${dir}/.capo/${job}/task-1.md, report ${dir}/.capo/${job}/task-1-r1-report.md`);
  const edit = (f) => run('guard-files.js', { agent_type: 'beltline:worker', agent_id: 'a1', transcript_path: main, cwd: dir, tool_input: { file_path: f } });
  assert.ok(!denied(edit(path.join(wt1, 'src/x.js'))), 'own file, own worktree');
  assert.ok(denied(edit(path.join(wt1, 'lib/x.js'))), 'another task file');
  assert.ok(denied(edit(path.join(wt2, 'lib/x.js'))), 'the other task worktree');
  assert.ok(denied(edit(path.join(dir, 'src/x.js'))), 'the main checkout');
  assert.ok(!denied(edit(path.join(dir, '.capo', job, 'task-1-r1-report.md'))), 'its report in the main .capo');
  assert.ok(!denied(edit(path.join(dir, '.capo', job, 'logs', 'task-1-r1-tests.log'))), 'a log');
  assert.ok(denied(edit(path.join(dir, '.capo', job, 'scope.txt'))), 'the scope file');
  // an agent whose task has no block is stopped, not given the union of the others
  const lost = session(dir, 'a3', `Read the brief ${dir}/.capo/${job}/task-3.md`);
  const r = run('guard-files.js', { agent_type: 'beltline:worker', agent_id: 'a3', transcript_path: lost, cwd: dir, tool_input: { file_path: path.join(dir, 'src/x.js') } });
  assert.ok(denied(r));
});
test('guard-files without a known brief falls back to the branch block, and to nothing', () => {
  const dir = repo();
  fs.mkdirSync(path.join(dir, '.capo', 'j'));
  fs.writeFileSync(path.join(dir, '.capo', 'j', 'scope.txt'), '# task 1 branch=main\nsrc/**\n# task 2 branch=other\nlib/**\n');
  const edit = (f) => run('guard-files.js', { agent_type: 'beltline:worker', cwd: dir, tool_input: { file_path: f } });
  assert.ok(!denied(edit('src/a.js')));
  assert.ok(denied(edit('lib/a.js')));
  g(dir, 'checkout', '-q', '-b', 'third');
  assert.ok(denied(edit('src/a.js')), 'a branch without a block is not given the union');
});

// ---- done-gate ----
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
test('done-gate reads report paths with spaces', () => {
  const dir = repo();
  const spaced = path.join(dir, 'my reports');
  fs.mkdirSync(spaced);
  fs.writeFileSync(path.join(spaced, 'task-1-r1-report.md'), '## Checks\n`npm test` exit 0\n');
  const r = run('done-gate.js', { agent_type: 'beltline:worker', cwd: dir, last_assistant_message: `STATUS: DONE\nREPORT: ${path.join(spaced, 'task-1-r1-report.md')}\nCOMMIT: abc\nCHECKS: ok` });
  assert.ok(!blocked(r));
});
test('done-gate asks the inspector for its result and checks file', () => {
  const dir = repo();
  const stop = (msg) => run('done-gate.js', { agent_type: 'beltline:inspector', cwd: dir, last_assistant_message: msg });
  assert.ok(blocked(stop('checked everything')));
  assert.ok(blocked(stop('RESULT: GREEN\nREPORT: .capo/j/task-1-r1-checks.md')));
  fs.mkdirSync(path.join(dir, '.capo', 'j'));
  fs.writeFileSync(path.join(dir, '.capo/j/task-1-r1-checks.md'), 'RESULT: GREEN\n');
  assert.ok(!blocked(stop('RESULT: GREEN\nREPORT: .capo/j/task-1-r1-checks.md\nRED: 0')));
});

// ---- meters ----
const usage = (id, i, o, r = 1, w = 0) => JSON.stringify({ message: { id, model: 'claude-sonnet-5-5', usage: { input_tokens: i, output_tokens: o, cache_read_input_tokens: r, cache_creation_input_tokens: w } } });
const toolUse = (id, name, input) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const toolResult = (id, chars) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'x'.repeat(chars) }] } });

test('cost-meter appends one line per stop in the job folder, with task, round, context and largest reads', () => {
  const dir = repo();
  const job = '2026-11-25-x';
  fs.mkdirSync(path.join(dir, '.capo', job));
  const tp = path.join(dir, 't.jsonl');
  const first = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: `Brief: /r/.capo/${job}/task-8a.md report /r/.capo/${job}/task-8a-r2-report.md` }] } });
  fs.writeFileSync(tp, [first, toolUse('u1', 'Read', { file_path: '/r/src/main.ts' }), toolResult('u1', 40000), usage('m1', 10, 5, 1, 100), usage('m1', 10, 5, 1, 100), usage('m2', 20, 7, 50, 3), 'not json', ''].join('\n'));
  run('cost-meter.js', { agent_type: 'beltline:worker', cwd: dir, agent_transcript_path: tp, agent_id: 'a1' });
  run('cost-meter.js', { agent_type: 'beltline:worker', cwd: dir, agent_transcript_path: tp, agent_id: 'a1' });
  run('cost-meter.js', { agent_type: 'beltline:reviewer', cwd: dir, agent_transcript_path: tp, agent_id: 'a2' });
  const rows = fs.readFileSync(path.join(dir, '.capo', job, 'costs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepStrictEqual(rows.map((r) => r.agent_id), ['a1', 'a1', 'a2']);
  const row = rows[0];
  assert.strictEqual(row.job, job);
  assert.strictEqual(row.input_tokens, 30);
  assert.strictEqual(row.output_tokens, 12);
  assert.strictEqual(row.cache_read_input_tokens, 51);
  assert.strictEqual(row.task, '8a');
  assert.strictEqual(row.round, 2);
  assert.strictEqual(row.context, 73);
  assert.strictEqual(row.top[0].what, 'Read /r/src/main.ts');
  assert.strictEqual(row.top[0].tokens, 10000);
  // the report keeps the last line per agent: a1 counted once
  const { report } = require('../scripts/costs.js');
  const rep = report(path.join(dir, '.capo', job));
  assert.strictEqual(rep.agents, 2);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'nocapo-'));
  g(other, 'init', '-q');
  const r = run('cost-meter.js', { agent_type: 'beltline:worker', cwd: other, agent_transcript_path: tp });
  assert.strictEqual(r.code, 0);
  assert.ok(!fs.existsSync(path.join(other, '.capo')));
});
test('capo-meter measures the main session while a job is active, reading only what was added', () => {
  const dir = repo();
  const job = '2026-11-25-x';
  fs.mkdirSync(path.join(dir, '.capo', job));
  const tp = path.join(dir, 'main.jsonl');
  fs.writeFileSync(tp, [usage('m1', 1, 10, 1000, 500)].join('\n') + '\n');
  const stop = () => run('capo-meter.js', { session_id: 's1', transcript_path: tp, cwd: dir });
  stop();
  assert.ok(!fs.existsSync(path.join(dir, '.capo', job, 'capo.json')), 'no active job, no meter');
  fs.writeFileSync(path.join(dir, '.capo', 'active'), job + '\n');
  stop();
  fs.appendFileSync(tp, [usage('m2', 1, 20, 2000, 100), toolUse('u9', 'Bash', { command: 'npm test' }), toolResult('u9', 8000)].join('\n') + '\n');
  stop();
  const data = JSON.parse(fs.readFileSync(path.join(dir, '.capo', job, 'capo.json'), 'utf8'));
  const s = data.sessions.s1;
  assert.strictEqual(s.output_tokens, 30);
  assert.strictEqual(s.cache_read_input_tokens, 3000);
  assert.strictEqual(s.context, 2101);
  assert.strictEqual(s.top[0].what, 'Bash npm test');
  assert.ok(!denied(run('capo-meter.js', { agent_type: 'beltline:worker', agent_id: 'x', transcript_path: tp, cwd: dir })));
});
test('context-meter speaks once per step, only in the main session of an active job', () => {
  const dir = repo();
  const job = '2026-11-25-x';
  fs.mkdirSync(path.join(dir, '.capo', job));
  fs.writeFileSync(path.join(dir, '.capo', 'active'), job);
  const tp = path.join(dir, 'main.jsonl');
  const at = (n) => fs.appendFileSync(tp, usage('m' + n, 0, 1, n, 0) + '\n');
  const tick = () => run('context-meter.js', { session_id: 's1', transcript_path: tp, cwd: dir, tool_name: 'Bash' });
  at(100000);
  assert.strictEqual(context(tick()), '');
  at(160000);
  assert.match(context(tick()), /about 160K tokens/);
  at(170000);
  assert.strictEqual(context(tick()), '', 'same step, silent');
  at(420000);
  assert.match(context(tick()), /about 420K tokens/);
  assert.strictEqual(context(run('context-meter.js', { agent_type: 'beltline:worker', agent_id: 'a', session_id: 's1', transcript_path: tp, cwd: dir })), '');
});
test('context-restore points a compacted or resumed session at the ledger', () => {
  const dir = repo();
  const job = '2026-11-25-x';
  assert.strictEqual(context(run('context-restore.js', { source: 'compact', cwd: dir })), '');
  fs.mkdirSync(path.join(dir, '.capo', job));
  fs.writeFileSync(path.join(dir, '.capo', job, 'ledger.md'), `# Beltline ledger — job: ${job}\nJob: ${job}\n`);
  fs.writeFileSync(path.join(dir, '.capo', 'active'), job);
  assert.match(context(run('context-restore.js', { source: 'compact', cwd: dir })), new RegExp(`read \\.capo/${job}/ledger\\.md`));
  assert.match(context(run('context-restore.js', { source: 'startup', cwd: dir })), /resume the job/);
});
