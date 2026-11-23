# Beltline

*An agent assembly line for Claude Code.*
[Leggi in italiano](README.it.md)

You design the job with Claude until it is clear, you give the go, and then a crew of agents builds it without needing
you to watch: cheap models first, stronger ones only when a check fails, machines and fresh reviewers verifying every
piece, walls (hooks) blocking the dangerous moves, and a ledger that survives context limits. Every job leaves lessons
for the next one.

Like a factory game, it is made of separate machines connected by belts. Each machine is one skill, agent or hook, and
you can use them on their own.

```
 design ──► schematic ──► GO ──► recruit ──► worker ──► verify ──► ledger ──► lessons ──► sweep
  (talk)      (plan)              (hire)     (build)    (check)    (store)    (learn)     (clean)
     ▲ council (hard choices)            simplifier       scout · reviewer · hunters
                     walls: guard-bash · guard-files · done-gate · cost-meter
```

## Install

```
/plugin marketplace add DioDiAltro/beltline
/plugin install beltline@beltline
```

Needs Node.js (already required by Claude Code). Works best with the
[superpowers](https://github.com/obra/superpowers) plugin installed: design and schematic hand over to its brainstorming
and planning skills when present.

## Use

Say "use beltline:capo to build …", or just hand over a large coding job. To continue after a pause or a usage limit:
"resume the job". Tell it "detailed mode" if you want to see every step; the default is quiet: one summary at the end.

## The machines

| Piece | Kind | What it does |
|---|---|---|
| `capo` | skill | The conductor: runs the belt from design to summary, decides instead of stopping |
| `design` | skill | Understands the job with you, one question at a time, and writes the design doc |
| `council` | skill | Four voices argue a hard choice so the first idea does not win by default |
| `schematic` | skill | Turns the design into tasks with exact scope, done-checks and a contract |
| `recruit` | skill | Picks agent, model and effort; writes the brief and scope; climbs the ladder on failure |
| `verify` | skill | Machines → scout → review with two verdicts; the author never reviews itself |
| `ledger` | skill | `.capo/` files that survive compaction; resume; costs |
| `lessons` | skill | Turns mistakes, corrections and costs into short rules |
| `sweep` | skill | Removes the documents, `.capo` files, worktrees and branches of jobs proven finished; keeps an index |
| `worker` | agent | Builds one task, test first, inside its scope |
| `scout` | agent | Read-only finder; uses a code graph (graphify) when present |
| `reviewer` | agent | Fresh-context review: did it do what was asked, is it done well |
| `silent-failure-hunter` | agent | Swallowed errors and fallbacks that hide failures |
| `test-analyzer` | agent | Do the tests cover behavior or just exist? |
| `simplifier` | agent | Cleans up green code without changing behavior |
| `guard-bash` | hook | Blocks push, `--no-verify`, stash, reset --hard, merges, writes to control files |
| `guard-files` | hook | Blocks edits outside the running tasks' scope (`.capo/scope.txt`) |
| `done-gate` | hook | A worker cannot say DONE without a status line and a report with real checks |
| `cost-meter` | hook | Logs tokens per agent and model to `.capo/costs.jsonl` |

The walls apply only to the kit's own agents: you and your main session are never blocked. Only the main session
dispatches agents and merges, because Claude Code subagents cannot start other subagents: a hierarchy of "foremen"
would not run, so large jobs are split into areas run one after another.

## Where the documents go

Each job keeps its design and plan in `docs/beltline/YYYY-MM-DD-<slug>/` with a `status: active | done` header. When
the job is finished and checked, `sweep` removes the folder (asking first unless the contract says yes) and adds a line
to `docs/beltline/INDEX.md` with the commit to recover it from.

## Models

Cheapest that is enough: `haiku` for mechanical tasks with a complete list, `sonnet` for features, `opus` for delicate
code, climbing `haiku → sonnet → opus → fable` only when a check fails. Override the table in your project instructions
with a "Beltline table" section.

## Tests

```
node --test tests/*.test.js
```

## Credits

MIT. Adapts ideas from [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) (MIT, Affaan
Mustafa) and [superpowers](https://github.com/obra/superpowers) (MIT, Jesse Vincent). See [NOTICE](NOTICE).
