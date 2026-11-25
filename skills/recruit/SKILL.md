---
name: recruit
description: Use when a planned coding task must be handed to a subagent, to pick the agent, model and effort, write the brief and scope file, dispatch it, and handle retries when a check comes back red or the agent needs context.
---

# Recruit

The machine that turns a task into a working agent. Cheapest model that is enough; climb only when a check fails.

## 1. Pick model and effort

Always pass `model` and `effort` in the Agent call: it makes the choice explicit and visible in the ledger.

| Task type | Agent | Model | Effort |
|---|---|---|---|
| Mechanical: the brief has the exact change and the complete list of points, 1-2 files | `beltline:worker` | `haiku` | `low` |
| Same small change in many files, complete list of points | `beltline:worker`, **one agent for the whole group** | `haiku` | `low` |
| Repeated change without a certain list, feature described in words, several files kept together | `beltline:worker` | `sonnet` | `medium` |
| Delicate code (security, saved data, concurrency), architecture, a bug nobody understands | `beltline:worker` | `opus` | `high` |
| Machine checks of verify level 1 | `beltline:inspector` | `sonnet` | `low` |
| Cleanup after a task is green | `beltline:simplifier` | `sonnet` | `low` |

A task starts above the table's row only for a reason written in the plan ("Type: delicate, because …"); without one it
starts on the row. The ladder for climbing: `haiku` → `sonnet` → `opus` → `fable` (if not available, `opus` with effort
`max`). Reviewers never go below `sonnet`. If the project instructions have a "Beltline table" section, or the user
names other models, they win.

## 2. Write the brief and the scope block

All paths given to agents are **absolute**: `<capo>` below is the job folder `.capo/<job>/` of the main repository
(`.capo/` is gitignored, so it does not exist inside a worktree), N the task id (3, 8a) and K the round (1, 2, 3).

Create `<capo>/logs/` if it is missing. Write `<capo>/task-N.md` with the task text copied from the plan, then:

- one line on where the task sits in the project, and the entry points the scout found (files, symbols);
- decisions taken during the job that the plan cannot know;
- the **Rules for agents** block, copied as is:

```
## Rules for agents
- Your checkout is <checkout>: run every command as `cd <checkout> && …` and use absolute paths under it for Read,
  Edit, Write, Grep and Glob. Another copy of the same file is not yours.
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
- Find before reading (code graph or grep). After three rounds of searching without what you need, NEEDS_CONTEXT.
- Touch only the files in Scope and respect Must not. If you need another file, stop with NEEDS_CONTEXT.
- Commit on the branch you are on; never switch branches. One commit for the task; on a retry add a fix commit, never
  amend. If you stop before finishing, commit the work in progress with "WIP" in the message.
- Never push, never --no-verify, never stash, reset --hard, merge or rebase. Commit a lockfile only when it is in Scope.
- Do not create other agents.
- Follow the global rules of the plan and the project instructions.
```

Never paste the history of earlier tasks into the brief.

Add the task's block to `<capo>/scope.txt`: a header line `# task N branch=<task branch> dir=<absolute checkout>`, then
one path or glob per line, relative to the repository root. The walls read the agent's task from its brief: it may edit
only its block's files, only under its `dir`. An agent whose task has no block is stopped. Shell writes are not
blocked; verify catches them. The block stays until the task is green and merged, also across retries; then remove it.

Record in the ledger: task, status `running`, BASE commit, branch, worktree, agent, model, effort.

## 3. Dispatch

Call the Agent tool with `subagent_type` (for example `beltline:worker`), `model`, `effort`, and a prompt that is
only: the absolute path of the brief, the absolute report path for this round, the checkout, and "Read the brief and
do the task".

**In parallel** only reads, research, or tasks that share no file and no resource: a fixed port, a local database or
server, a generated file, a test run that counts things (licenses, menu items) another task changes. The plan's table
of shared files and its Watch out list them; tasks that share one run in sequence or get their own copy (another port).
For each parallel task the capo creates the worktree itself, outside the repository so the project's tools do not see
it (`git worktree add <repo>/../<repo name>-worktrees/<task> -b <task branch>`), installs dependencies there with the
project's command (for example `npm ci`), and gives its absolute path as the checkout. Merging happens after verify,
in `beltline:capo`; generated files (for example a code graph) are regenerated after the merge, not merged.

## 4. When verify comes back red

`beltline:verify` returns what works and what does not (file, line, failing check, severity).

**Only high and medium findings send a task back.** Low findings (style, naming, rare cases with no user harm) go to
`<capo>/lows.md` with task, file and line, and the task is green. Before the final branch review, the capo sends one
cleanup task for all of `lows.md` that still matter (or lists them in the summary). A red machine check is never low.

Before any redispatch: the task's scope block is still there, and the capo makes the tree clean (it commits or
discards leftovers itself, writing what it did in the ledger). Each round writes new files (`task-N-rK-report.md`,
`task-N-rK-checks.md`, `task-N-rK-verify.md`), so the history stays.

1. **Round 1**: the same worker with the list (SendMessage), when its context was small (the `context` of its last
   line in `costs.jsonl` under about 80K tokens); a resumed agent rereads all of its context. Otherwise a fresh agent
   of the same level with brief, previous report and list.
2. **Round 2**: a new agent one step up the ladder, with brief, report and list: "Another agent tried; the task is now
   yours; its report says what it attempted".
3. **Round 3**: the capo decides what changes: the task is too large (split it into two tasks, plan them, log it), the
   plan is wrong (a Decision, then a fresh agent), or it fixes it personally; searches go through the scout.
4. **Still red**: mark the task BLOCKED in the ledger with what was tried, and continue with the tasks that do not
   depend on it.

After each fix, rerun the check that was red and the checks of the touched files, not the whole chain. Climb only for a
fact (a red check, a problem with file and line), never for an impression.

A DONE_WITH_CONCERNS whose doubts are about correctness means: the review is not skipped and receives the doubts.

## 5. NEEDS_CONTEXT

Read the "## Needs" section of the report. If what is asked follows from the design (a file the plan forgot, a name
it left open), add the file to the task's Scope and scope block, log a Decision, and resend the same agent level: this
is not a round. If it needs something outside the contract, it is a stop case of `beltline:capo`.
