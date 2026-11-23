---
name: schematic
description: Use when an approved design must become a build plan of tasks that agents can execute without asking, inside a capo job or alone, or when the user says "write the plan" for a job that is already designed.
---

# Schematic

The plan that the factory runs: tasks a cheap agent can execute without guessing, each with a check a machine can
decide, plus the contract that lets the job run without interrupting the user.

If the superpowers plugin is installed, write the plan with `superpowers:writing-plans` and then add the fields below
to every task; its code snippets may stay as guidance, but the fields below win where they disagree, and the plan stays
where writing-plans saved it (the ledger records that path). When writing-plans asks how to execute, the answer is: with `beltline:capo`, after the contract. Do not
use `executing-plans` or `subagent-driven-development`.

Without superpowers, write it by hand in `docs/projects/YYYY-MM-DD-<name>-plan.md`.

## At the top of the plan

- **Global rules**: the constraints from the design and the project instructions that apply to these tasks, with exact
  values (for example "every UI text in both languages"). Workers do not read the whole project instructions.
- **Watch out**: the five cases the design implies, that no test covers, and that would hurt users most; for each one,
  the test that blocks it, inside the right task.
- **Contract** (below).

## Every task

- What to do.
- **Scope**: the exact list of files it may touch, tests, translations and docs included. Globs are allowed
  (`src/skill/**`). This list becomes the scope file that the walls enforce.
- **Must not**: what it may not do to reach green (change or remove existing tests, touch saved user data, push).
- **Uses / Produces**: exact names (functions, types) taken from earlier tasks and left for later ones.
- **Done-check**: commands and the expected result, decidable by a machine. For a repeated change, also the command
  that proves the old form is gone (an empty `grep`).
- **Test first**: the task starts from a failing test (with superpowers, `superpowers:test-driven-development`).
- **Type** for `beltline:recruit`: mechanical (with the complete list of points), repeated, feature, delicate.

A task is the smallest piece that has its own tests and that a reviewer could reject on its own. The plan decides what
a worker cannot decide alone (names, values, tests); it does not write the code for it. The last task updates the
documents the project asks for (roadmap, README, privacy notice).

Before handing it over, read the plan against the design: does every requirement have a task? Are names the same in
every task? Which tasks touch the same files (they must run in sequence)?

## The contract

Decide now what would otherwise block later. Propose values; the user corrects them.

| Item | Default to propose |
|---|---|
| Telling the user | `quiet` |
| Working branch | a branch for the job, or the one the project uses for previews |
| Allowed at the end (yes/no each) | commit yes; push to the working branch; merge into other branches no; preview build; publish no |
| Already allowed | web search; new libraries no; external services no; database migrations no; deleting files no |
| If something blocks | skip that check, log it, say it in the summary |

What is not in the contract does not happen during the job.
