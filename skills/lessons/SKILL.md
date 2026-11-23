---
name: lessons
description: Use at the end of a capo job, when the user corrects how Claude works in a project, or when they ask what was learned or why tasks kept climbing the model ladder; turns mistakes and corrections into short rules.
---

# Lessons

Every job leaves data: which tasks climbed the ladder, which questions came after the go, which errors repeated, what
the user corrected, what each task cost. This piece turns them into a few rules the next job uses.

## Sources

- `.capo/ledger.md`: models, effort, rounds, blocked tasks, decisions;
- `.capo/task-N-rK-report.md` and `.capo/task-N-rK-verify.md`: what failed in each round and why;
- `.capo/costs.jsonl`: tokens per agent and model;
- the user's corrections in the conversation ("no, do it this way").

## A lesson

```
- When: <a situation someone who was not there can recognize>
  Do: <one thing>
  Evidence: <job and date> (<what happened>) · ...
  Confidence: low | medium | high
```

- **Low**: seen once. **Medium**: twice, or once with a correction from the user. **High**: three or more times, or
  the user stated it as a rule.
- New evidence raises confidence; contrary evidence lowers it or removes the lesson.
- A lesson that contradicts the project instructions is not written: propose changing the instructions instead.

## Where lessons go

- **Project lessons**: `.claude/lessons.md` in the repository (committed). The capo reads it when design starts.
- **Model table**: if a task type climbed in more than half of its cases (at least three cases), or its cost per task
  is far above the others for no gain, propose a change to the user in a "Beltline table" section of the project
  instructions.
- **Kit lessons**: a high-confidence lesson seen in two different projects is proposed to the user as a change to the
  kit itself.

Low-confidence lessons that saw no new evidence in three jobs are removed: the file stays short or nobody reads it.

## At the end of a job

1. Read ledger, verification reports and costs.
2. For each task that climbed, got blocked, cost much more than similar ones, or raised a question after the go: will
   the situation repeat? If yes, a lesson (new, or new evidence for an existing one).
3. Update `.claude/lessons.md`, then any proposal for the table or the kit.
4. In the final summary: each new lesson in one line, and the proposals waiting for the user's yes.

| Mistake | Instead |
|---|---|
| A lesson as long as a story | When, do, evidence: three lines |
| "Be more careful" | One precise action in a recognizable situation |
| Changing the table or the kit alone | Propose it to the user |
| Copying what the project instructions already say | Only new things |
