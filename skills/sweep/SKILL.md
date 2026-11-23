---
name: sweep
description: Use at the end of a Beltline job, or when the user asks to clean up ("pulisci", "clean up", "remove old plans"), to remove the design and plan documents, .capo files, worktrees and branches of jobs that are really finished, after checking they are.
---

# Sweep

Removes what finished jobs leave behind, and only what is proven finished. A document of work still in progress is
never removed: when in doubt, keep it and say why.

## What it may remove

Only Beltline's own leftovers:

- the job folder `docs/beltline/YYYY-MM-DD-<slug>/` (design and plan; see `beltline:design`);
- that job's files in `.capo/` (`task-*`, `scope.txt`), never `costs.jsonl`, `archive/` or another job's files;
- worktrees and task branches listed in that job's ledger, once merged.

Anything else (other documents, roadmaps, notes, the project's own files) is out of reach, even if it looks old. To
clean those, the user asks for it file by file.

## Steps

1. **Pick the jobs.** At the end of a capo job: that job. When the user asks: every folder in `docs/beltline/` except
   `INDEX.md`, one at a time.
2. **Machine check.** Run the check script that sits next to this file:

   ```
   node "${CLAUDE_SKILL_DIR}/check.js" docs/beltline/<job>
   ```

   (If the variable is empty, use the path of the folder this SKILL.md was loaded from.) It changes nothing and prints
   a JSON report: both documents marked `status: done`, the folder committed and holding only `design.md` and
   `plan.md`, a ledger that mentions the job with every task `done`, every task branch merged into HEAD, and no other
   file pointing at the folder. Exit code 0 means every check is green; `remove` lists what may go.
3. **Done-checks again.** Read the plan and rerun its done-checks (or the project's test command if they are many).
   Red means the work is not really done: keep everything and report it.
4. **Lessons first.** If `beltline:lessons` has not run for this job, run it before anything in `.capo/` disappears:
   the ledger and the reports are its evidence.
5. **Ask or go.** The contract's "Cleanup at the end" decides. `ask` (the default, and always when the user asked
   without a contract): show the list (what, why it is finished, how to get it back) and wait for a yes. `yes`: go on.
6. **Remove**, in this order:
   - worktrees: `git worktree remove <path>` (never with `--force`: if it refuses, the worktree has unsaved work,
     keep it and report it);
   - merged task branches: `git branch -d <branch>` (lowercase `-d`: git refuses unmerged branches);
   - the job's `.capo/` files; append a one-line cost total for the job to the index first (from `costs.jsonl`);
   - the job folder: `git rm -r docs/beltline/<job>`, then one commit `sweep: <job>`.
7. **Index.** Add one line to `docs/beltline/INDEX.md` (create it if missing) and commit it with the removal:

   ```
   - YYYY-MM-DD-<slug> — what was built, in one line — removed in <commit hash> (git show <hash>^:docs/beltline/<job>/design.md) — cost: <tokens>
   ```

   The documents stay in git history: the index says where to find them.

## What it never does

- Remove a job with any red check, a task not `done`, or an unmerged branch.
- Remove untracked or uncommitted files, force a worktree, or delete an unmerged branch.
- Push. The removal commit follows the contract's push rule like any other commit.

## Report

```
SWEEP
removed: <job> (commit <hash>) · ...
kept: <job> — <failing check> · ...
waiting for yes: <job> — <what would be removed> · ...
```
