---
name: council
description: Use for an ambiguous decision with several credible paths, such as choosing between ways to build something during design, a go/no-go call, or when the user asks for second opinions or dissent; not for code review or factual questions.
---

# Council

Four voices argue before a choice, so the first idea in the conversation does not win by default. Adapted from the
council skill of Everything Claude Code (MIT).

| Voice | Lens |
|---|---|
| Architect (you, in context) | correctness, maintainability, long-term effects |
| Skeptic | challenges the premise, looks for the simpler path |
| Pragmatist | speed of shipping, user impact, real constraints |
| Critic | edge cases, downside risk, how it fails |

## Steps

1. **The real question** in one sentence: what is being decided, which constraints matter, what success means. If it
   is still vague, ask the user one question first.
2. **Compact context**: only the snippets, numbers or document parts that change the answer.
3. **Your position first** (Architect): your choice, its three strongest reasons, its main risk. Write it before
   reading the others, so the synthesis does not just mirror them.
4. **Three fresh agents in parallel** (`sonnet`, `low`), each with only the question, the compact context and its
   role: "Argue from your lens. Give your choice, your two strongest reasons, and what would change your mind. Under
   200 words." They do not see the conversation: that is the protection against anchoring.
5. **Synthesis**: where they agree, where they disagree and why, which disagreement is about facts (then check the
   fact) and which about values (then it is the user's call). Your recommendation, and what would make it wrong.

Show the user the synthesis, not four essays. The user decides.

## When not to use it

Correctness of code (`beltline:verify`), splitting work into tasks (`beltline:schematic`), factual questions (look it
up), obvious tasks (do them).
