---
name: verify
description: Use before calling any coding work done, for one task of an agent team, for a whole branch before merging or publishing, or when the user asks "check this", "review it" or "is it ready?".
---

# Verify

Work is done when checks prove it, not when its author says so. Check from the cheapest to the most expensive; one red
level is enough to stop and send it back. The author never reviews their own work: a model rereading its own code
tends to confirm its mistakes, and models also rate their own outputs higher than others' (Panickssery et al., 2024),
so for delicate tasks prefer a reviewer of a different model than the author.

The project instructions say which commands test and build: use those. BASE is the commit before the work; HEAD is
the task's branch, and for a task in a worktree the checks run inside that worktree, before merging.

## Level 1 — Machines (always)

In a capo job, `beltline:inspector` (`sonnet`, `low`) runs them: its prompt gives brief, checkout, BASE, branch, the
checks file `<capo>/task-N-rK-checks.md`, the logs folder and the project's commands. The capo reads only the first
lines of the checks file. Alone, run them yourself. The author's report says what they ran; it is not proof.

Leave generated files out of diffs (for example `git diff BASE..HEAD -- . ':!graphify-out'`). Record command and
result for each, not a summary:

1. build and type check;
2. the linter, if the project has one;
3. tests: the task's done-check, then the project's tests; slow ones (browser, e2e) when the UI changes or when
   closing a branch;
4. secrets: no keys, tokens, passwords or `.env` in the diff
   (`git diff BASE..HEAD | grep -nEi "(api[_-]?key|secret|token|password|sk-)"`, then look at every hit);
5. tests intact: no existing test removed, skipped (`skip`, `only`, `todo`) or with its expected value changed unless
   the task asked for it. A test changed so that it passes is red;
6. checks intact: no change to what judges the work (linter, formatter and type configs, test configs and their
   excludes, CI workflows, the test scripts in package.json) unless the task asked for it. Loosening one is red;
7. scope: `git diff --name-only BASE..HEAD` lists only files in the task's scope; one extra file is red;
8. lockfile: changed only if the task's scope lists it;
9. completeness: for a repeated change, the done-check that searches for the old form is empty;
10. no push and no shortcuts: the remote branch has not moved since the task started, no `--no-verify`;
11. new tests fail on BASE, for the right reason:
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/bite.js" --base BASE --dir <checkout> --files <new test files> --log <capo>/logs/task-N-rK-bite.log --cmd "<test command, {files} for the files>"`.
    It runs them in a temporary checkout of BASE with the task's dependencies linked. A new test that passes there
    proves nothing; one that fails for a missing module or a setup error proves nothing either. For a bug fix this is
    the counter-test: on BASE the bug is still there.

## Level 2 — Scout and hunters

Write the diff once to `<capo>/task-N.diff` (`git diff BASE..HEAD -- . ':!<generated files>' > <file>`): the read-only
agents below get its absolute path; the capo does not read it.

- **Scout** (`beltline:scout`): receives the diff file and answers with paths and lines only: who else uses the
  touched functions, types or files; which of those places have no tests; whether the code graph is stale (then you,
  not the scout, refresh it and repeat the question).
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

Its CANNOT VERIFY items (requirements outside the diff) are settled by the capo, who holds the plan: a real gap counts
as a medium finding. The final branch review looks at how the tasks fit together and what changed after their reviews,
without repeating them.

## The verification report

Write it to a file (in a capo job `<capo>/task-N-rK-verify.md`, from the inspector's first lines and the short answers
of the other agents) and answer with the first line:

```
RESULT: GREEN | RED
Machines: <the inspector's Machines line>
Scout: no findings | N findings · Hunter: —/N · Test analyzer: —/N
Review: done / skipped (why) — asked ✓/✗ · well done ✓/✗ · cannot verify: —/N settled
Live: verified / not done (why) / not needed
Does not work (file:line — what breaks — failing check — high | medium | low):
- ...
```

RESULT is RED only for a red machine check or a high or medium finding. Low findings are listed, the result stays
GREEN, and the capo collects them in `<capo>/lows.md`. All agents use the same scale: high, medium, low.

"Live" is separate: green local checks do not say the published site works. Write "verified" only after seeing it.

## Common mistakes

| Mistake | Instead |
|---|---|
| "Tests pass" without command and output | The command and its output, in the checks file |
| The author reviews their own code | A fresh reviewer, of another model for delicate tasks |
| A finding without file and line | Drop it or find the spot |
| A test or a check config changed so it passes | Red, back to fixing the code |
| A new test that also passes on BASE | Red: it does not test the change |
| Running the next levels after a red | Stop and send it back |
