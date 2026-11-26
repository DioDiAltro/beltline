---
name: ledger
description: Use when a long agent job needs a record that survives context compaction or usage limits, to open, update or resume a job's ledger in .capo/, to look up a past decision without rereading everything, or to read what each task and the capo cost.
---

# Ledger

The factory's storehouse. Memory does not survive a summary of the conversation or a usage limit; files do. Everything
that leaves the conversation stays here, on disk and searchable: the conversation holds only pointers to it.

## Files

Each job has its own folder `.capo/<job>/` at the repository root, named like the job (`YYYY-MM-DD-<slug>`); add
`.capo/` to `.gitignore` if it is not there. `.capo/active` holds the name of the running job: the hooks read it.

| File in `.capo/<job>/` | What |
|---|---|
| `ledger.md` | The job: identity line, header, task table, decisions |
| `task-N.md` | Brief of task N (N may be 3 or 8a) |
| `task-N-rK-report.md` | What the agent did in round K, with "## Checks" (and "## Needs" when it stopped) |
| `task-N-rK-checks.md` | The inspector's machine checks of round K |
| `task-N-rK-verify.md` | The verification report of round K |
| `task-N-simplify-report.md` | What the simplifier did |
| `task-N.diff` | The diff given to read-only agents |
| `scope.txt` | One block per running task: files and checkout its agent may edit (read by the walls) |
| `costs.jsonl` | One line per agent stop, written by the cost meter (the last line per agent counts) |
| `capo.json` | The capo's own tokens, context size and largest tool results, written at each turn |
| `lows.md` | Low findings left for the final cleanup task |
| `logs/` | Full output of tests and builds; only summaries enter a conversation |

## The ledger

```
# Beltline ledger — job: YYYY-MM-DD-<slug>
Job: YYYY-MM-DD-<slug> · Folder: docs/beltline/YYYY-MM-DD-<slug>/
Contract: <the contract table, copied>
Remote branch at start: <commit>

| Task | Status | BASE | Branch | Worktree | Agent | Model | Effort | Rounds |
|---|---|---|---|---|---|---|---|---|
| 1 | done | abc123 | job/t1 | ../repo-worktrees/<job>-t1 | worker | haiku | low | 1 |

## Decisions
- Decision: what — why — cost if wrong
```

The first two lines are the ledger's identity: a ledger belongs to the job its `Job:` line names, never to a job it
only mentions. Statuses: `todo`, `running`, `checking`, `done`, `blocked`.

Opening a job: create `.capo/<job>/`, write the ledger, write the job name to `.capo/active`. Ending it (after lessons,
before or with sweep): remove `.capo/active`.

## Resume

After a context summary, a usage limit or in a new session ("resume the job"): the job is the one in `.capo/active`
(the session start hook already points at it). Read the ledger, `git worktree list` and `git log`, continue from the
first task that is not `done` or `blocked`, and never redo finished tasks. For each unfinished task, look at its branch
(`git log BASE..<task branch>`), in its worktree if it has one:

- `running` with commits on its branch → `beltline:verify` (a WIP commit: redispatch the same round with the report);
- `running` without commits → clean its tree and start it again;
- `checking` → `beltline:verify` again from level 1;
- green but not merged → merge it as `beltline:capo` says.

A job started with Beltline 0.2 keeps its files directly in `.capo/` (`ledger.md`, `task-*`, `scope.txt`): move them
into `.capo/<job>/`, add the identity line, write `.capo/active`, then resume.

## Look things up, do not reread

To find a past decision or what an agent did, search instead of reading whole files:

```
grep -n "Decision:" .capo/<job>/ledger.md
grep -rn "<word>" .capo/<job>/*report.md
```

## Costs and context

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/costs.js" .capo/<job>
```

prints, in a few lines, the cost per task, model and agent at list prices (the capo included), the largest contexts and
the largest tool results. `--line` gives one line for the index.

How the bill is made: everything that enters a context is paid once as a cache write (about 25 times the price of a
cache read) and then reread at every following step. Short agents pay mostly writes, the long capo mostly reads. So
the lever is the same in both cases: keep out what is not needed. A large `context` means a task grew too long (split
it next time); a large tool result means output that should have gone to a log or a file read in parts.
