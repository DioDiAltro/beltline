---
name: schematic
description: Use when an approved design must become a build plan of tasks that agents can execute without asking, inside a capo job or alone, or when the user says "write the plan" for a job that is already designed.
---

# Schematic

The plan that the factory runs: tasks a cheap agent can execute without guessing, each with a check a machine can
decide, plus the contract that lets the job run without interrupting the user.

The plan is `docs/beltline/YYYY-MM-DD-<slug>/plan.md`, in the same job folder as the design, with the header described
in `beltline:design` (`beltline: plan`, `status: active`).

If the superpowers plugin is installed, write it with `superpowers:writing-plans`, and before invoking it state the
user's preferences, which it follows: the plan is saved at that path with that header, and the execution method is
already chosen: `beltline:capo`, after the contract (so do not use `executing-plans` or
`subagent-driven-development`). Then add the fields below to every task; its code snippets may stay as guidance, but
the fields below win where they disagree. If it saved the plan elsewhere anyway, move it with `git mv` and add the
header. Without superpowers, write it by hand.

## At the top of the plan

- **Global rules**: the constraints from the design and the project instructions that apply to these tasks, with exact
  values (for example "every UI text in both languages"). Workers do not read the whole project instructions.
- **Watch out**: the five cases the design implies, that no test covers, and that would hurt users most; for each one,
  the test that blocks it, inside the right task.
- **Shared files and interfaces**: a table with one row per pair of tasks that touch the same file, the same resource
  (a fixed port, a local server or database, a generated file, a check that counts things: licenses, menu entries,
  routes) or the same name (one produces it, the other uses it), and the order they run in. Tasks in this table never
  run in parallel. Then one line per task: do its tests agree with its code, and its files with the files it touches
  later?
- **Contract** (below).

## Every task

- What to do.
- **Scope**: the exact list of files it may touch, tests, translations and docs included. Globs are allowed
  (`src/skill/**`). This list becomes the scope block that the walls enforce. A task that adds an allowed library also
  lists the lockfile.
- **Must not**: what it may not do to reach green (change or remove existing tests, loosen a lint or test config,
  touch saved user data, push).
- **Uses / Produces**: exact names (functions, types) taken from earlier tasks and left for later ones.
- **Done-check**: commands and the expected result, decidable by a machine. For a repeated change, also the command
  that proves the old form is gone (an empty `grep`).
- **Test first**: the task starts from a failing test (with superpowers, `superpowers:test-driven-development`).
- **Type** for `beltline:recruit`: mechanical (with the complete list of points), repeated, feature, delicate. A task
  that should start above the table's model says why ("delicate: it rewrites saved notes").

A task is the smallest piece that has its own tests and that a reviewer could reject on its own. Keep tasks small
enough to finish in one sitting: about five files changed, or one view. A task that is larger, or that builds a big
view, is split; first take out its pure part (data and logic without UI, with its own tests) as a task of its own that
can run in parallel. A long task is expensive: every step rereads everything the agent has seen so far. The plan decides
what a worker cannot decide alone (names, values, tests); it does not write the code for it. The last task updates the
documents the project asks for (roadmap, README, privacy notice).

Before handing it over, read the plan against the design: does every requirement have a task? Are names the same in
every task? Is every pair that shares something in the table?

## The contract

Decide now what would otherwise block later. Propose values; the user corrects them.

| Item | Default to propose |
|---|---|
| Telling the user | `quiet` |
| Working branch | a branch for the job, or the one the project uses for previews |
| Allowed at the end (yes/no each) | commit yes; push to the working branch; merge into other branches no; preview build; publish no |
| Already allowed | web search; new libraries no; external services no; database migrations no; deleting files no |
| Compaction | at about 200K tokens (`autoCompactWindow` in the settings), the ledger keeps the state |
| Cleanup at the end | `ask`: `beltline:sweep` shows what it would remove and waits; `yes`: it removes after its checks |
| If something blocks | skip that check, log it, say it in the summary |

What is not in the contract does not happen during the job.
