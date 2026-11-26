# Beltline

*An agent assembly line for Claude Code.*
[Leggi in italiano](README.it.md)

You design the job with Claude until it is clear, you give the go, and then a crew of agents builds it without needing
you to watch: cheap models first, stronger ones only when a check fails, machines and fresh reviewers verifying every
piece, walls (hooks) blocking the dangerous moves, a ledger on disk that survives compaction and usage limits, and a
meter that says where every token went. Every job leaves lessons for the next one.

Like a factory game, it is made of separate machines connected by belts. Each machine is one skill, agent or hook, and
you can use them on their own.

```
 design ──► schematic ──► GO ──► recruit ──► worker ──► verify ──► ledger ──► lessons ──► sweep
  (talk)      (plan)              (hire)     (build)    (check)    (store)    (learn)     (clean)
     ▲ council (hard choices)            simplifier    inspector · scout · reviewer · hunters
      walls: guard-bash · guard-files · done-gate     meters: cost · capo · context
```

## Install

```
/plugin marketplace add DioDiAltro/beltline
/plugin install beltline@beltline
```

Needs **Node.js 18+ on the PATH**: the hooks are Node scripts. The native installer of Claude Code does not install
Node, and a hook that cannot start does not block anything, so without Node the walls and the meters are silently off
(the capo checks `node --version` before the go). Works best with the [superpowers](https://github.com/obra/superpowers)
plugin installed: design and schematic hand over to its brainstorming and planning skills when present.

Recommended for long jobs: compact well before the model's limit, for example `/autocompact 200k`, or
`"autoCompactWindow": 200000` in `.claude/settings.json`. The ledger keeps the state, so a compaction loses nothing.

## Use

Say "use beltline:capo to build …", or just hand over a large coding job. To continue after a pause, a compaction or a
usage limit: "resume the job". Tell it "detailed mode" if you want to see every step; the default is quiet: one summary
at the end.

## The machines

| Piece | Kind | What it does |
|---|---|---|
| `capo` | skill | The conductor: runs the belt from design to summary, decides instead of stopping, keeps its own context small |
| `design` | skill | Understands the job with you, one question at a time, and writes the design doc |
| `council` | skill | Four voices argue a hard choice so the first idea does not win by default |
| `schematic` | skill | Turns the design into tasks with exact scope, done-checks, a table of shared files, and a contract |
| `recruit` | skill | Picks agent, model and effort; writes the brief and scope; climbs the ladder on failure |
| `verify` | skill | Machines → scout and hunters → review with two verdicts; the author never reviews itself |
| `ledger` | skill | The job folder in `.capo/` that survives compaction; resume; costs |
| `lessons` | skill | Turns mistakes, corrections, costs and context data into short rules |
| `sweep` | skill | Removes the documents, `.capo` files, worktrees and branches of jobs proven finished; keeps an index |
| `worker` | agent | Builds one task, test first, inside its scope and its checkout |
| `inspector` | agent | Runs the machine checks of a task and answers with its result in three lines, so the capo does not read logs |
| `scout` | agent | Read-only finder; uses a code graph (graphify) when present |
| `reviewer` | agent | Fresh-context review: did it do what was asked, is it done well, what it cannot verify |
| `silent-failure-hunter` | agent | Swallowed errors and fallbacks that hide failures |
| `test-analyzer` | agent | Do the tests cover behavior or just exist? |
| `simplifier` | agent | Cleans up green code without changing behavior |
| `guard-bash` | hook | Blocks push, `--no-verify`, stash, reset --hard, merges, branch and history changes, writes to control files, also inside multi-line commands, `bash -c`, `eval` and PowerShell |
| `guard-files` | hook | Each editing agent may change only its own task's files, inside its own checkout |
| `done-gate` | hook | A worker cannot say DONE without a status line and a report with real checks |
| `cost-meter` | hook | Tokens, context size and largest tool results of every agent, in the job's `costs.jsonl` |
| `capo-meter` | hook | The same for the main session, the most expensive one |
| `context-meter` | hook | Tells the capo once at 150K, 250K, 400K and 600K tokens to checkpoint and read less |
| `context-restore` | hook | After a compaction or in a new session, points Claude at the ledger of the running job |

Three scripts back them: `scripts/costs.js` (the cost report of a job), `scripts/bite.js` (do the new tests fail on the
code before the task?) and `scripts/worktree.js` (a checkout for each task, next to the repository, with the
dependencies linked).

Every task works in its own worktree, so the main checkout stays clean while agents work. Claude Code on the web wakes
the session at the end of every turn while there are uncommitted changes or unpushed commits; there the contract can
push the working branch after each merge, so the capo waits in silence: `⏳ 1 · 3/14` (agents working · tasks done).

The walls apply only to the kit's own agents: you and your main session are never blocked. They are guardrails
against habits and mistakes, not a sandbox: a program written to get around them could. Only the main session
dispatches agents and merges; recent Claude Code versions let subagents start their own, but Beltline does not rely
on that, so large jobs are split into areas run one after another.

## Context

What enters a conversation is paid once to be written into the prompt cache, then reread at every step until a
compaction. Beltline keeps out what is not needed, instead of compressing it after:

- **Out at the source.** Test and build output goes to log files; agents answer with four lines; machine checks,
  searches and screenshots are read by agents, not by the capo.
- **On disk, searchable.** The ledger, briefs, reports and checks of a job live in `.capo/<job>/`: a compaction or a
  new session loses nothing, and details are found with `grep` instead of rereading.
- **Measured.** The meters record how big each context got and which tool results filled it; `costs.js` and
  `lessons` turn that into rules for the next job.
- **Told in time.** The context meter warns the capo at fixed steps; after a compaction the session start hook points
  it back at the ledger.

No proxy sits between Claude Code and the API, and nothing rewrites the conversation: the prompt cache keeps working.

## Where the files go

Each job keeps its design and plan in `docs/beltline/YYYY-MM-DD-<slug>/` with a `status: active | done` header, and
its working files in `.capo/YYYY-MM-DD-<slug>/` (gitignored); `.capo/active` names the running job. When the job is
finished and checked, `sweep` removes both (asking first unless the contract says yes) and adds a line to
`docs/beltline/INDEX.md` with the commit to recover them from and the job's cost.

## Models

Cheapest that is enough: `haiku` for mechanical tasks with a complete list, `sonnet` for features and checks, `opus`
for delicate code, climbing `haiku → sonnet → opus → fable` only when a check fails; a task starts higher only for a
reason written in the plan. Override the table in your project instructions with a "Beltline table" section.

## Upgrading from 0.2

A job started with 0.2 keeps its files directly in `.capo/`. "Resume the job" moves them into `.capo/<job>/` and goes
on. The walls read both layouts.

## Tests

```
node --test tests/*.test.js
```

## Credits

MIT. Adapts ideas from [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) (MIT, Affaan
Mustafa) and [superpowers](https://github.com/obra/superpowers) (MIT, Jesse Vincent). See [NOTICE](NOTICE).
