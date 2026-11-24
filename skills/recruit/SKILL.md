---
name: recruit
description: Use when a planned coding task must be handed to a subagent, to pick the agent, model and effort, write the brief and scope file, dispatch it, and handle retries when a check comes back red or the agent needs context.
---

# Recruit

The machine that turns a task into a working agent. Cheapest model that is enough; climb only when a check fails.

## 1. Pick model and effort

Always pass `model` and `effort` in the Agent call: without them the agent inherits the session model, the most
expensive one.

| Task type | Agent | Model | Effort |
|---|---|---|---|
| Mechanical: the brief has the exact change and the complete list of points, 1-2 files | `beltline:worker` | `haiku` | `low` |
| Same small change in many files, complete list of points | `beltline:worker`, **one agent for the whole group** | `haiku` | `low` |
| Repeated change without a certain list, feature described in words, several files kept together | `beltline:worker` | `sonnet` | `medium` |
| Bug nobody understands, architecture, delicate code (security, saved data, concurrency) | `beltline:worker` | `opus` | `high` |
| Cleanup after a task is green | `beltline:simplifier` | `sonnet` | `low` |

The ladder for climbing: `haiku` → `sonnet` → `opus` → `fable` (if not available, `opus` with effort `max`).
Reviewers never go below `sonnet`: small models take more rounds and end up costing more. If the project instructions
have a "Beltline table" section, or the user names other models, they win.

## 2. Write the brief and the scope file

All paths given to agents are **absolute paths in the main repository's `.capo/`**: `.capo/` is gitignored, so it
does not exist inside a worktree. Below, `<capo>` means that absolute folder and K the round (1, 2, 3).

Create `<capo>/logs/` if it is missing. Write `<capo>/task-N.md` with the task text copied from the plan, then:

- one line on where the task sits in the project;
- decisions taken during the job that the plan cannot know;
- the **Rules for agents** block, copied as is:

```
## Rules for agents
- Do not narrate. Write everything in <capo>/task-N-rK-report.md: what you did, a "## Checks" section with each
  command you ran, its exit code and output, and doubts. If you stop for context, a "## Needs" section: which file or
  decision, and why.
- Your final message is exactly these four lines and nothing else:
  STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
  REPORT: <capo>/task-N-rK-report.md
  COMMIT: <hash or none>
  CHECKS: <one line>
- Long output never enters your context: run tests, builds and browser checks as
  `<command> > <capo>/logs/task-N-rK-<name>.log 2>&1; echo "exit=$?"`, then read only the summary line and the failing
  lines (`tail -n 30`, or `grep` for the failure markers). Read files in the parts you need, not whole.
- Touch only the files in Scope and respect Must not. If you need another file, stop with NEEDS_CONTEXT.
- Commit on the branch you are on; never switch branches. One commit for the task; on a retry add a fix commit, never
  amend. If you stop before finishing, commit the work in progress with "WIP" in the message.
- Never push, never --no-verify, never stash, reset --hard, merge or rebase. Never commit lockfile changes.
- Do not create other agents.
- Follow the global rules of the plan and the project instructions.
```

Never paste the history of earlier tasks into the brief.

Add the task's block to `<capo>/scope.txt`: a header line `# task N branch=<task branch>`, then one path or glob
per line, relative to the repository root. An agent working on that branch may edit only its block's files (Edit and
Write are blocked outside it; shell writes are not blocked, verify catches them). The block stays until the task is
green and merged, also across retries; then remove it.

Record in the ledger: task, status `running`, BASE commit, branch, worktree, agent, model, effort.

## 3. Dispatch

Call the Agent tool with `subagent_type` (for example `beltline:worker`), `model`, `effort`, and a prompt that is
only: the absolute path of the brief, the absolute report path for this round, and "Read the brief and do the task".

**In parallel** only reads, research, or tasks on different files that also share no resource: a fixed port, a
local database or server, a generated file, a test run that counts things (licenses, menu items) another task
changes. The plan's Watch out lists them; when two tasks need the same one, run them in sequence or give each its own
(another port, a copy of the script). For each, the capo creates the worktree itself
(`git worktree add <dir> -b <task branch>`), installs dependencies there with the project's command (for example
`npm ci`), and tells the agent to work in that folder. Merging happens after verify, in `beltline:capo`; generated
files (for example a code graph) are regenerated after the merge, not merged.

## 4. When verify comes back red

`beltline:verify` returns a list: what works, what does not (file, line, failing check, severity).

**Only high and medium findings send a task back.** Low findings (style, naming, rare cases with no user harm) go to
`<capo>/lows.md` with task, file and line, and the task is green. Before the final branch review, the capo sends one
cleanup task for all of `lows.md` that still matter (or lists them in the summary). A red machine check is never low.

Before any redispatch: the task's scope block is still there, and the capo makes the tree clean (it commits or
discards leftovers itself, writing what it did in the ledger). Each round writes new files (`task-N-rK-report.md`,
`task-N-rK-verify.md`), so the history stays.

1. **Round 1**: the list goes back to the same worker (SendMessage if it is still alive, otherwise a new agent of the
   same level with brief, previous report and list).
2. **Round 2**: a new agent one step up the ladder, with brief, report and list: "Another agent tried; the task is now
   yours; its report says what it attempted".
3. **Round 3**: the capo fixes it personally; searches go through the scout.
4. **Still red**: mark the task BLOCKED in the ledger with what was tried, and continue with the tasks that do not
   depend on it.

After each fix, rerun the check that was red and the checks of the touched files, not the whole chain. Climb only for a
fact (a red check, a problem with file and line), never for an impression.

A DONE_WITH_CONCERNS whose doubts are about correctness means: the review is not skipped and receives the doubts.

## 5. NEEDS_CONTEXT

Read the "## Needs" section of the report. If what is asked follows from the design (a file the plan forgot, a name
it left open), add the file to the task's Scope and scope block, log a Decision, and resend the same agent level: this
is not a round. If it needs something outside the contract, it is a stop case of `beltline:capo`.
