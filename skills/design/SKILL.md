---
name: design
description: Use when a coding job needs to be understood and designed with the user before any plan or code, either inside a capo job or alone, when the user says "let's design", "help me think this through" or brings a rough idea.
---

# Design

Turn a rough request into a design document the user approved. Questions happen here, so the build can run without
them.

If the superpowers plugin is installed, run `superpowers:brainstorming`, and before invoking it state the user's
preference, which it follows: the design is saved as `design.md` in the job folder below, with the Beltline header.
Stop when it would hand over to its own planning: the plan is `beltline:schematic`. If it saved the design elsewhere
anyway, move it with `git mv` and add the header. Without superpowers, follow the steps below.

## The job folder

Every Beltline job keeps its documents in one folder: `docs/beltline/YYYY-MM-DD-<slug>/` (date of the start, slug in
kebab-case, the same name as the job in the ledger). Inside: `design.md` and `plan.md`. Each starts with:

```
---
beltline: design | plan
job: YYYY-MM-DD-<slug>
status: active | done
---
```

Nothing else goes in that folder, and Beltline documents go nowhere else: this is what lets `beltline:sweep` remove a
finished job safely. The capo sets `status: done` when the job ends.

## Steps

1. **Look before asking.** Read what the user pointed at and the project documents about it. For the code, ask the
   scout (`beltline:scout`) how it works today and what the job would touch. Never ask what the documents or the code
   already say, and never reopen what the user already decided.
2. **The why first.** What should it achieve, for whom, and what would count as a failure even if it works.
3. **One question at a time**, only when the answer changes what gets built. For everything else, propose with a
   reason.
4. **Real examples beat questions.** If similar products, features or libraries exist, search the web and show them:
   adopting or extending one often beats building it.
5. **Play back** each part you understood in a few lines ("I understood: ..."), then move on.
6. **Ways to build it.** In a message of its own: two or three ways, what each costs, which one you recommend. If the
   choice is genuinely hard, run `beltline:council` first and show its synthesis. The user picks.
7. **Write the design document** as `docs/beltline/YYYY-MM-DD-<slug>/design.md`, with the header above:
   - why, goals, non-goals, what would be a failure even if it works;
   - constraints (from the user and the project instructions);
   - the ways considered and the one chosen;
   - decisions taken, marking those the capo took alone;
   - what is left to the builder.
8. **Builder test.** A fresh agent (`sonnet`, `medium`) reads only the document and the project and lists what stops
   it from building. Split its questions: already answered (write the answer into the document), detail (decide and
   mark it as your choice), the user's (change what gets built). The user's questions go out in one message, most
   important first.
9. **Approval.** The user approves the document. Then `beltline:schematic`.

## Sizing

A small change gets a short document (a few lines per section). Do not inflate it: the document exists so the plan
and the builders do not guess, not to look complete.
