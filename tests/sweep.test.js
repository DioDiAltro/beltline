'use strict';
// Tests for the sweep check. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { main } = require('../skills/sweep/check.js');

const JOB = '2026-11-23-export-pdf';
const g = (dir, ...a) => execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...a], { cwd: dir, stdio: 'pipe' });
const doc = (kind, status, job = JOB) => `---\nbeltline: ${kind}\njob: ${job}\nstatus: ${status}\n---\n# ${kind}\n`;
const ledger = (rows, job = JOB, extra = '') =>
  `# Beltline ledger — job: ${job}\nJob: ${job} · Folder: docs/beltline/${job}/\n\n| Task | Status | BASE | Branch | Worktree | Agent | Model | Effort | Rounds |\n|---|---|---|---|---|---|---|---|---|\n${rows}\n\n## Decisions\n${extra}`;

function setup({ status = 'done', rows = `| 1 | done | abc | ${JOB}-t1 | — | worker | haiku | low | 1 |`, layout = 'job' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
  g(dir, 'init', '-q', '-b', 'main');
  const job = path.join(dir, 'docs/beltline', JOB);
  fs.mkdirSync(job, { recursive: true });
  fs.writeFileSync(path.join(job, 'design.md'), doc('design', status));
  fs.writeFileSync(path.join(job, 'plan.md'), doc('plan', status));
  fs.writeFileSync(path.join(dir, '.gitignore'), '.capo/\n');
  g(dir, 'add', '-A'); g(dir, 'commit', '-qm', 'docs');
  g(dir, 'checkout', '-qb', `${JOB}-t1`);
  fs.writeFileSync(path.join(dir, 'a.js'), '1\n'); g(dir, 'add', '-A'); g(dir, 'commit', '-qm', 't1');
  g(dir, 'checkout', '-q', 'main'); g(dir, 'merge', '-q', '--no-ff', '-m', 'merge', `${JOB}-t1`);
  const capo = layout === 'job' ? path.join(dir, '.capo', JOB) : path.join(dir, '.capo');
  fs.mkdirSync(capo, { recursive: true });
  fs.writeFileSync(path.join(capo, 'ledger.md'), ledger(rows));
  fs.writeFileSync(path.join(capo, 'task-1.md'), 'brief');
  fs.writeFileSync(path.join(capo, 'costs.jsonl'), '');
  return dir;
}
const failing = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name);

test('a finished job is green and lists its .capo folder, branches and the active pointer', () => {
  const dir = setup();
  fs.writeFileSync(path.join(dir, '.capo', 'active'), JOB + '\n');
  const r = main(JOB, dir);
  assert.deepStrictEqual(failing(r), []);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.remove.docs, [`docs/beltline/${JOB}`]);
  assert.deepStrictEqual(r.remove.branches, [`${JOB}-t1`]);
  assert.deepStrictEqual(r.remove.capo, [`.capo/${JOB}/`, '.capo/active']);
});
test('a job still active is kept', () => {
  const r = main(`docs/beltline/${JOB}/`, setup({ status: 'active' }));
  assert.ok(!r.ok);
  assert.strictEqual(r.remove, null);
  assert.ok(failing(r).includes('design.md status done'));
});
test('a task not done is kept', () => {
  const r = main(JOB, setup({ rows: `| 1 | done | a | — | — | worker | haiku | low | 1 |\n| 2 | blocked | b | — | — | worker | opus | high | 3 |` }));
  assert.ok(!r.ok);
  assert.ok(failing(r).includes('all tasks done'));
});
test('an unmerged branch is kept', () => {
  const dir = setup();
  g(dir, 'checkout', '-qb', `${JOB}-t2`);
  fs.writeFileSync(path.join(dir, 'b.js'), '2\n'); g(dir, 'add', 'b.js'); g(dir, 'commit', '-qm', 't2');
  g(dir, 'checkout', '-q', 'main');
  fs.writeFileSync(path.join(dir, '.capo', JOB, 'ledger.md'), ledger(`| 1 | done | a | ${JOB}-t1 | — | w | h | l | 1 |\n| 2 | done | b | ${JOB}-t2 | — | w | h | l | 1 |`));
  const r = main(JOB, dir);
  assert.ok(!r.ok);
  assert.ok(failing(r).includes(`branch ${JOB}-t2 merged`));
});
test('a reference from another file, an extra file, or no ledger keeps it', () => {
  let dir = setup();
  fs.writeFileSync(path.join(dir, 'ROADMAP.md'), `see docs/beltline/${JOB}/design.md\n`);
  g(dir, 'add', '-A'); g(dir, 'commit', '-qm', 'ref');
  assert.ok(failing(main(JOB, dir)).includes('no references'));
  dir = setup();
  fs.writeFileSync(path.join(dir, 'docs/beltline', JOB, 'notes.md'), 'x');
  assert.ok(failing(main(JOB, dir)).includes('only job documents'));
  dir = setup();
  fs.rmSync(path.join(dir, '.capo', JOB, 'ledger.md'));
  assert.ok(failing(main(JOB, dir)).includes('ledger found'));
});
test('the ledger of another job that only mentions this one is not taken for it', () => {
  // the archived ledger of this job has a blocked task; the current ledger of a newer job mentions it in a decision
  const dir = setup({ layout: 'flat' });
  fs.mkdirSync(path.join(dir, '.capo', 'archive'));
  fs.writeFileSync(path.join(dir, '.capo', 'archive', `${JOB}.md`), ledger(`| 1 | blocked | a | — | — | w | h | l | 3 |`));
  fs.writeFileSync(path.join(dir, '.capo', 'ledger.md'), ledger(`| 1 | done | a | — | — | w | h | l | 1 |`, '2026-11-25-new', `- Decision: reuse the parser of ${JOB}\n`));
  const r = main(JOB, dir);
  assert.ok(!r.ok, 'the blocked task of the real ledger keeps the job');
  assert.strictEqual(r.checks.find((c) => c.name === 'ledger found').detail, path.join('.capo', 'archive', `${JOB}.md`));
  assert.strictEqual(r.remove, null);
});
test('a flat 0.2 ledger offers its task files; an archived one offers none', () => {
  let dir = setup({ layout: 'flat' });
  let r = main(JOB, dir);
  assert.ok(r.ok, JSON.stringify(failing(r)));
  assert.ok(r.remove.capo.includes('.capo/task-1.md'));
  assert.ok(!r.remove.capo.includes('.capo/costs.jsonl'));
  dir = setup({ layout: 'flat' });
  fs.mkdirSync(path.join(dir, '.capo/archive'));
  fs.renameSync(path.join(dir, '.capo/ledger.md'), path.join(dir, '.capo/archive', `${JOB}.md`));
  r = main(JOB, dir);
  assert.ok(r.ok, JSON.stringify(failing(r)));
  assert.deepStrictEqual(r.remove.capo, []);
});
test('the index may mention the job', () => {
  const dir = setup();
  fs.writeFileSync(path.join(dir, 'docs/beltline/INDEX.md'), `- ${JOB} docs/beltline/${JOB}\n`);
  g(dir, 'add', '-A'); g(dir, 'commit', '-qm', 'index');
  assert.ok(main(JOB, dir).ok);
});
