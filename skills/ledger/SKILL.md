---
name: ledger
description: Use when a long agent job needs a record that survives context compaction or usage limits, to open, update or resume `.capo/ledger.md`, to look up a past decision without rereading everything, or to read what each task cost.
---

# Ledger

The factory's storehouse. Memory does not survive a summary of the conversation or a usage limit; files do.

## Files

All in `.capo/` at the repository root (add `.capo/` to `.gitignore` if it is not there):

| File | What |
|---|---|
| `ledger.md` | The job: header, task table, decisions |
| `task-N.md` | Brief of task N |
| `task-N-rK-report.md` | What the agent did in round K, with "## Checks" (and "## Needs" when it stopped) |
| `task-N-rK-verify.md` | The verification report of round K |
| `task-N-simplify-report.md` | What the simplifier did |
| `task-N.diff` | The diff given to read-only agents |
| `scope.txt` | One block per running task: files its agent may edit (read by the walls) |
| `costs.jsonl` | One line per finished agent, written by the cost meter hook |
| `archive/` | Ledgers of earlier jobs |

## The ledger

```
# <job name>
Job: YYYY-MM-DD-<slug> · Folder: docs/beltline/YYYY-MM-DD-<slug>/
Contract: <the contract table, copied>
Remote branch at start: <commit>

| Task | Status | BASE | Branch | Worktree | Agent | Model | Effort | Rounds |
|---|---|---|---|---|---|---|---|---|
| 1 | done | abc123 | job/t1 | — | worker | haiku | low | 1 |

## Decisions
- Decision: what — why — cost if wrong
```

Statuses: `todo`, `running`, `checking`, `done`, `blocked`.

If a ledger of a different job is there, move it to `.capo/archive/` before starting.

## Resume

After a context summary or a usage limit: read the ledger, `git worktree list` and `git log`, continue from the first
task that is not `done` or `blocked`, and never redo finished tasks. For each unfinished task, look at its branch
(`git log BASE..<task branch>`), in its worktree if it has one:

- `running` with commits on its branch → `beltline:verify` (a WIP commit: redispatch the same round with the report);
- `running` without commits → clean its tree and start it again;
- `checking` → `beltline:verify` again from level 1;
- green but not merged → merge it as `beltline:capo` says.

## Look things up, do not reread

To find a past decision or what an agent did, search instead of reading whole files:

```
grep -n "Decision:" .capo/ledger.md
grep -rn "<word>" .capo/*report.md
```

## Costs

The cost meter hook appends one JSON line per finished kit agent to `.capo/costs.jsonl`: agent, task and round (read
from the brief and report paths in its prompt), model, tokens. Totals per task and model:

```
node -e "const l=require('fs').readFileSync('.capo/costs.jsonl','utf8').trim().split('\n').map(JSON.parse);const t={};for(const x of l){const k='task '+(x.task||'?')+' '+x.agent_type+' '+(x.model||'?');t[k]=t[k]||{runs:0,in:0,out:0};t[k].runs++;t[k].in+=x.input_tokens+x.cache_read_input_tokens+x.cache_creation_input_tokens;t[k].out+=x.output_tokens}console.table(t)"
```
