---
name: capo
description: Use when the user hands over a large coding job (a project document, a roadmap item, "build all of this") to be designed with them and then built by a team of agents without interrupting them, or says "resume the job" on a plan that already started.
---

# Capo

The capo (Italian for "boss") runs the factory. It does almost nothing by hand: it moves the job along the belts and
calls the right machine at each step. Every machine is a skill or an agent of this plugin and also works on its own.

```
design ──► schematic ──► contract ──► GO ──► recruit ─► worker ─► verify ─┐
  ▲            ▲                               ▲      (inspector,  │       │
council    council                          (retry/    reviewer)  red    green
                                            escalate) ◄────────────┘       │
                                                                           ▼
                                                ledger ◄── every step   lessons ──► sweep ──► summary
```

The project's own instructions (CLAUDE.md or similar) win over every piece of this plugin: test commands, branches,
what may be published, what must not be read, language. Documents, briefs, reports, ledger and commits follow the
project's language.

If `.capo/active` names a job, or a `.capo/<job>/ledger.md` exists for this one, go straight to **Resume** in
`beltline:ledger`.

## Part 1 — Design with the user (talking is allowed here)

The quiet mode applies only after the go. Before it, ask everything that matters: whatever is still open after the
go, the capo decides alone.

1. Read the project instructions in full, and `.claude/lessons.md` if it exists.
2. **Design**: `beltline:design`. Questions one at a time, the why first, real examples, 2-3 ways to build it, the
   design document, the builder test.
3. **Hard choice between ways?** `beltline:council` before asking the user to pick.
4. **Plan**: `beltline:schematic`. Tasks with scope, must-not, done-check, model and effort, and the table of the
   files and names that tasks share.
5. **Contract**: `beltline:schematic` also drafts it; the user corrects it.
6. **Before the go**, check and fix:
   - `design.md` and `plan.md` are in `docs/beltline/YYYY-MM-DD-<slug>/`, each starting with the Beltline header
     (`beltline: design|plan`, `job: YYYY-MM-DD-<slug>`, `status: active`). A document saved elsewhere (superpowers
     uses its own folders) moves there with `git mv`, gets the header, its links are fixed, and it is committed. Never
     copy: one document, one place.
   - `node --version` works. Without Node.js the walls and meters do not run at all (a hook that cannot start does
     not block): say so to the user with the go question.
   - Claude Code on the web (`~/.claude/stop-hook-git-check.sh` exists) wakes the session at the end of every turn while
     the repository has uncommitted changes or unpushed commits: propose "Push the working branch: after each merge" in
     the contract, so the capo can wait in silence.
   - The compaction window: a long job should compact well before the model's limit. If neither the project's nor the
     user's settings set `autoCompactWindow`, propose `"autoCompactWindow": 200000` in `.claude/settings.json` (or
     `/autocompact 200k`); the ledger makes compaction safe.
7. **The go**: the user has seen design, plan and contract, then says go. Nothing is built before (reading and
   exploring is fine). If the conversation is long, ask the user to run `/compact` together with the go: everything
   is on files.

## Part 2 — Build without interrupting

**Quiet mode** (the default; the contract may set `detailed`): between tool calls you write nothing. A turn that waits
for agents ends with this one line and nothing else, whatever the language of the project:
`⏳ <agents working> · <tasks done>/<tasks>` (for example `⏳ 1 · 3/14`). If something wakes you while agents are working
(a message that changes nothing, or a check of the environment asking to commit or push), do what the contract allows
and end again with the same line, without explanations. You write to the user only to stop (below), for the checkpoint
line, and for the final summary.

1. Open the ledger (`beltline:ledger`): write `.capo/active`, the contract and the tasks.
2. **Crew or alone?** One or two small tasks, or all on the same files: the capo does them or sends one worker, same
   checks. Three or more tasks, or independent ones: the crew.
3. For each task, in plan order: `beltline:recruit` picks agent, model and effort, writes the brief and the scope
   block, and dispatches. Tasks that share a file or a resource never run in parallel: a Decision cannot change this.
4. Each finished task goes through `beltline:verify` on its own branch (`BASE..<task branch>`): the inspector runs the
   machines, then the hunters and the reviewer. Red goes back through the retry ladder of `beltline:recruit`. Green:
   the capo merges it into the working branch (parallel tasks one at a time, tests after each merge, output in a log),
   pushes the working branch if the contract says "after each merge", then removes the worktree
   (`node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.js" remove --repo <root> --dir <worktree>`) and the scope block.
   **Jobs with something to look at** (a view, a layout, a chart): after the first merge that shows it, a reviewer
   takes the screenshots and judges them; the capo opens an image only when a finding needs its decision.
   **Checkpoint**: after each merge the ledger is complete enough to resume from it alone. If the conversation has
   already been compacted once, the context meter has spoken, or four or more tasks were merged in this session, the
   capo writes one line to the user, once per job: "Everything is in the ledger: a new session with *resume the job*
   starts lighter." Then it continues.
5. Optional cleanup: when the review listed clutter, `beltline:simplifier` on the task, then verify level 1 again.
   Before the final review, one cleanup task for what is left in the job's `lows.md`.
6. After all tasks: `beltline:verify` on the whole branch, with all project checks and the final review.
7. `beltline:lessons`; set `status: done` in the job folder's `design.md` and `plan.md`.
8. `beltline:sweep` for this job, as the contract says (`ask` by default: the list goes in the summary and waits for
   the user's yes).
9. One summary.

Only the capo (the main session) dispatches agents and merges. Recent Claude Code versions let subagents start their
own, but the depth depends on version and settings, so Beltline does not rely on it: its agents have no Agent tool.
For a very large job, split the plan into areas run one after the other.

## Keep your own context small

The capo's conversation is the most expensive one: it is the longest, it runs on the session's model, and every step
rereads all of it. What enters it stays until a compaction.

- Never read a diff, a log or a whole report. Read status lines, the first lines of checks and verify files
  (`head -n 4`), and the ledger with `grep`.
- Machine checks go to the inspector, searches to the scout, screenshots to a reviewer.
- Commands with long output write to the job's `logs/`; only the summary line enters the conversation.
- The ledger is updated at every step, so a compaction at any moment loses nothing. When the context meter speaks,
  finish the step, complete the ledger and continue reading only what you must.

## Telling the user

The contract sets the mode, and it applies to every layer (the briefs carry it):

- **quiet** (default): the box at the start of Part 2. With one agent and nothing else to do, the capo waits for it in
  the foreground when the session allows it. The final summary also tells the errors it solved alone.
- **detailed**: as quiet, plus one line per closed task and per decision taken.

Agents never narrate: everything goes into their report file, and they answer only with the short status.

## Decide instead of stopping

Doubts, contradictions in the plan, small choices: the capo decides and writes it in the ledger
(`Decision: what, why, cost if wrong`). The design document is the authority, the plan applies it, common sense covers
what neither says. A Decision never changes the walls, the scope rules, the parallel rule or the contract.

Stop and write to the user only for what the contract does not cover and that cannot be undone or touches security:
deleting things or changing data users already saved; keys, accounts, other people's data, new libraries or external
services; push, publishing or merging into the main branch beyond the contract; a plan so wrong that every path is a
guess. Even then, prepare everything up to the choice, finish first the tasks that do not depend on it, then end the
turn with the question: what is needed and what you recommend (the answer can only arrive after the turn ends).

## Final summary

What was done, branch and commits, decisions taken alone, errors and how they were solved, blocked tasks, costs
(`node "${CLAUDE_PLUGIN_ROOT}/scripts/costs.js" .capo/<job>`: per task, model and agent, the capo included, and the
largest tool results), new lessons, and what is left, including what only the user can test (real devices, real
accounts, the live site: "live" is said only after seeing it).

## Common mistakes

| Mistake | Instead |
|---|---|
| Building before the go | Design, plan and contract approved, then the go |
| A question after the go that could have been asked before | Decide, log it, and add it to lessons |
| A crew for two small tasks | The capo or one worker |
| Doing a machine's job by hand | Call the piece: recruit, inspector, verify, ledger, lessons |
| Reading a diff or a full log "just to be sure" | The inspector and the reviewer read; you read their first lines |
| Two tasks on the same file in parallel "to save time" | In sequence: conflicts cost more than the wait |
| Stopping on a blocked task | Mark it BLOCKED and continue with independent tasks |
