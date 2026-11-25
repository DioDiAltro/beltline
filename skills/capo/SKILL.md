---
name: capo
description: Use when the user hands over a large coding job (a project document, a roadmap item, "build all of this") to be designed with them and then built by a team of agents without interrupting them, or says "resume the job" on a plan that already started.
---

# Capo

The capo (Italian for "boss") runs the factory. It does almost nothing by hand: it moves the job along the belts and
calls the right machine at each step. Every machine is a skill or an agent of this plugin and also works on its own.

```
design ──► schematic ──► contract ──► GO ──► recruit ─► worker ─► verify ─┐
  ▲            ▲                               ▲                 │       │
council    council                          (retry/            red      green
                                            escalate) ◄────────┘        │
                                                                         ▼
                                              ledger ◄── every step   lessons ──► summary
```

The project's own instructions (CLAUDE.md or similar) win over every piece of this plugin: test commands, branches,
what may be published, what must not be read, language. Documents, briefs, reports, ledger and commits follow the
project's language.

If `.capo/ledger.md` already exists for this job, go straight to **Resume** in `beltline:ledger`.

## Part 1 — Design with the user (talking is allowed here)

The quiet mode applies only after the go. Before it, ask everything that matters: whatever is still open after the
go, the capo decides alone.

1. Read the project instructions in full, and `.claude/lessons.md` if it exists.
2. **Design**: `beltline:design`. Questions one at a time, the why first, real examples, 2-3 ways to build it, the
   design document, the builder test.
3. **Hard choice between ways?** `beltline:council` before asking the user to pick.
4. **Plan**: `beltline:schematic`. Tasks with scope, must-not, done-check, model and effort.
5. **Contract**: `beltline:schematic` also drafts it; the user corrects it.
6. **Job folder check**, before showing the go: `design.md` and `plan.md` must be in `docs/beltline/YYYY-MM-DD-<slug>/`,
   each starting with the Beltline header (`beltline: design|plan`, `job: YYYY-MM-DD-<slug>`, `status: active`). Other
   skills (superpowers' brainstorming and writing-plans) save in their own folders by default: if a document is
   elsewhere, move it with `git mv`, add the header, fix any link to the old path, and commit. Never copy: one
   document, one place.
7. **The go**: the user has seen design, plan and contract, then says go. Nothing is built before (reading and
   exploring is fine). If the conversation is long, ask the user to run `/compact` together with the go: everything
   is on files.

## Part 2 — Build without interrupting

1. Open the ledger (`beltline:ledger`) and write the contract and the tasks into it.
2. **Crew or alone?** One or two small tasks, or all on the same files: the capo does them or sends one worker, same
   checks. Three or more tasks, or independent ones: the crew.
3. For each task, in plan order: `beltline:recruit` picks agent, model and effort, writes the brief and the scope
   block, and dispatches. Independent tasks on different files may run in parallel, each in its own worktree.
4. Each finished task goes through `beltline:verify` on its own branch (`BASE..<task branch>`). Red sends it back
   through the retry ladder in `beltline:recruit`. Green: the capo merges it into the working branch (parallel tasks
   one at a time, rerunning the tests after each merge), removes its worktree and its scope block.
   **Jobs with something to look at** (a view, a layout, a chart): after the first merge that shows it, the capo takes
   screenshots and looks at them, not only at the end: tests do not see hidden names or a cramped layout.
   **Checkpoint**: after each merge, the ledger is complete enough to resume from it alone. If the conversation has
   already been compacted once, or four or more tasks were merged in this session, the capo writes one line to the
   user, once per job: "Everything is in the ledger: a new session with *resume the job* starts lighter." Then it
   continues.
5. Optional cleanup: when the review listed clutter, `beltline:simplifier` on the task, then verify level 1 again.
   Before the final review, one cleanup task for what is left in `.capo/lows.md`.
6. After all tasks: `beltline:verify` on the whole branch, with all project checks and the final review.
7. `beltline:lessons`; set `status: done` in the job folder's `design.md` and `plan.md`.
8. `beltline:sweep` for this job, as the contract says (`ask` by default: the list goes in the summary and waits for
   the user's yes).
9. One summary.

Only the capo (the main session) dispatches agents and merges: subagents cannot start other subagents. For a very
large job, split the plan into areas and run them one after the other, not a hierarchy.

## Telling the user

The contract sets the mode, and it applies to every layer (the briefs carry it):

- **quiet** (default): text between tool calls is empty. When the capo ends a turn to wait for agents, its whole
  message is one line in this exact form, with nothing else: `⏳ <n> agents working`. With one agent and nothing else to
  do, it waits for that agent in the foreground (no wake-ups, no line). It writes to the user only when it must stop
  (below), for the checkpoint line, and for the final summary, which also tells the errors it solved alone.
- **detailed**: as quiet, plus one line per closed task and per decision taken.

Agents never narrate: everything goes into their report file, and they answer only with the short status. The capo
follows the agents' rule for long output too: test and build logs go to `.capo/logs/`, only the summary line enters
the conversation.

## Decide instead of stopping

Doubts, contradictions in the plan, small choices: the capo decides and writes it in the ledger
(`Decision: what, why, cost if wrong`). The design document is the authority, the plan applies it, common sense covers
what neither says.

Stop and write to the user only for what the contract does not cover and that cannot be undone or touches security:
deleting things or changing data users already saved; keys, accounts, other people's data, new libraries or external
services; push, publishing or merging into the main branch beyond the contract; a plan so wrong that every path is a
guess. Even then, prepare everything up to the choice, finish first the tasks that do not depend on it, then end the
turn with the question: what is needed and what you recommend (the answer can only arrive after the turn ends).

## Final summary

What was done, branch and commits, decisions taken alone, errors and how they were solved, blocked tasks, cost per
task (from the ledger), new lessons, and what is left, including what only the user can test (real devices, real
accounts, the live site: "live" is said only after seeing it).

## Common mistakes

| Mistake | Instead |
|---|---|
| Building before the go | Design, plan and contract approved, then the go |
| A question after the go that could have been asked before | Decide, log it, and add it to lessons |
| A crew for two small tasks | The capo or one worker |
| Doing a machine's job by hand | Call the piece: recruit, verify, ledger, lessons |
| Stopping on a blocked task | Mark it BLOCKED and continue with independent tasks |
