---
name: verify
description: Use before calling any coding work done, for one task of an agent team, for a whole branch before merging or publishing, or when the user asks "check this", "review it" or "is it ready?".
---

# Verify

Work is done when checks prove it, not when its author says so. Check from the cheapest to the most expensive; one red
level is enough to stop and send it back. The author never reviews their own work: a model rereading its own code
tends to confirm its mistakes.

The project instructions say which commands test and build: use those. BASE is the commit before the work; HEAD is
the task's branch, and for a task in a worktree the checks run inside that worktree, before merging.

## Level 1 — Machines (always)

Rerun the commands yourself: the author's report says what they ran, it is not proof. Leave generated files out of
diffs (for example `git diff BASE..HEAD -- . ':!graphify-out'`).

Run and record command and result, not a summary:

1. build and type check;
2. the linter, if the project has one;
3. tests: the task's done-check, then the project's tests; slow ones (browser, e2e) when the UI changes or when
   closing a branch;
4. secrets: no keys, tokens, passwords or `.env` in the diff
   (`git diff BASE..HEAD | grep -nEi "(api[_-]?key|secret|token|password|sk-)"`, then look at every hit);
5. tests not weakened: no existing test removed, skipped (`skip`, `only`) or with its expected value changed unless the
   task asked for it. A test changed so that it passes is red;
6. scope: `git diff --name-only BASE..HEAD` lists only files in the task's scope; one extra file is red;
7. completeness: for a repeated change, the done-check that searches for the old form is empty;
8. no push and no shortcuts: the remote branch has not moved since the task started, no `--no-verify`;
9. new tests bite: copy them into a checkout of BASE (`git worktree add <tmp dir> BASE`, copy the new test files) and
   run them: they must fail. A new test that passes without the new code proves nothing. Remove the checkout after;
10. for a bug fix, the counter-test: back up the files, put the bug back, the new test must fail, restore from the
    backup (never `git checkout` or `git stash` with unsaved work). Nobody else works on those files meanwhile.

## Level 2 — Scout and hunters

Write the diff once to `.capo/task-N.diff` (`git diff BASE..HEAD -- . ':!<generated files>'`): the read-only agents
below get its absolute path.

- **Scout** (`beltline:scout`): receives the diff file and answers with paths and lines only: who else uses the
  touched functions, types or files; which of those places have no tests; whether the code graph is stale (then you,
  not the scout, refresh it and repeat the question). If one of its findings would change the decision, check that spot yourself.
- **Silent-failure hunter** (`beltline:silent-failure-hunter`): on tasks that touch error handling, I/O, network,
  storage or async code. Swallowed errors and fallbacks that hide failures are what tests miss.
- **Test analyzer** (`beltline:test-analyzer`): on feature tasks: do the tests cover behavior or just exist?

## Level 3 — Review (a model with a clean context)

Skipped only for mechanical tasks with level 1 green and no findings at level 2. Never skipped when the task adds text
people read (UI, translations, docs): a machine sees the key exists, not that the translation is right. Never skipped
when the author wrote doubts about correctness: the reviewer gets them.

The reviewer (`beltline:reviewer`, `sonnet`, `medium`; the strongest available for the final branch review) reads
brief, report and diff (in a file) and the code around the changes, then gives **two verdicts**:

1. **Does it do what was asked?** Every request in the brief is done; nothing outside the scope; Must not respected.
2. **Is it done well?** Bugs, edge cases, security, data, consistency with the rest of the project.

The final branch review looks at how the tasks fit together and what changed after their reviews, without repeating
them.

## The verification report

Write it to a file (in a capo job `.capo/task-N-rK-verify.md`, K = round) and answer with the first line:

```
RESULT: GREEN | RED
Machines: build ✓/✗ · types ✓/✗ · lint ✓/✗/— · tests X/Y ✓/✗ · secrets ✓/✗ · tests intact ✓/✗ · scope ✓/✗ · complete ✓/✗/— · no push ✓/✗ · new tests bite ✓/✗/— · counter-test ✓/✗/—
Scout: no findings | N findings · Hunter: —/N · Test analyzer: —/N
Review: done / skipped (why) — asked ✓/✗ · well done ✓/✗
Live: verified / not done (why) / not needed
Works:
- ...
Does not work (file:line — what breaks — failing check):
- ...
```

"Live" is separate: green local checks do not say the published site works. Write "verified" only after seeing it.

## Common mistakes

| Mistake | Instead |
|---|---|
| "Tests pass" without command and output | The command and its output, in the report |
| The author reviews their own code | A fresh reviewer |
| A finding without file and line | Drop it or find the spot |
| A test changed so it passes | Red, back to fixing the code |
| Running the next levels after a red | Stop and send it back |
