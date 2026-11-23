#!/usr/bin/env node
'use strict';
// Wall: shell commands the kit's agents may never run. The user and the main session are not affected.

const { readInput, agentName, deny } = require('./lib');

// Matches "git [global options] <subcommand>" at the start of a command segment. Quoted strings are removed first, so a
// commit message that says "merge" or "push" is not a match.
const G = String.raw`(?:^|[;&|(]\s*|\bthen\s+|\bdo\s+)git(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s+`;
const sub = (s, rest = '') => new RegExp(G + '(?:' + s + String.raw`)(?![\w-])` + rest);
const A = String.raw`[^;&|\n]*`; // the rest of the same command segment
const RULES = [
  [sub('push'), 'Agents never push. The capo pushes at the end, if the contract allows it.'],
  [/--no-verify\b/, 'Agents never skip the git hooks (--no-verify).'],
  [sub('commit', A + String.raw`\s-[a-zA-Z]*n[a-zA-Z]*(\s|$)`), 'Agents never skip the git hooks (commit -n).'],
  [sub('stash'), 'Agents never stash: unsaved work can be lost. Commit, or stop with NEEDS_CONTEXT.'],
  [sub('reset', A + '--hard\\b'), 'Agents never reset --hard: it destroys work.'],
  [sub('clean', A + String.raw`\s-[a-zA-Z]*f`), 'Agents never run git clean -f: it deletes files.'],
  [sub('checkout', A + String.raw`(\s--(\s|$)|\s\.(\s|$)|\s-f\b)`), 'Agents never discard changes with git checkout.'],
  [sub('restore', String.raw`(?![^;&|\n]*--staged)`), 'Agents never discard changes with git restore.'],
  [sub('switch|checkout'), 'Agents never switch branches or check out files: commit on the branch you are on.'],
  [sub('rebase|merge'), 'Agents never rebase or merge: the capo merges.'],
];

// Writing to the factory control files (scope, ledger, briefs) from the shell. Reading them is fine.
const CONTROL = String.raw`["']?[^\s;&|]*\.capo/(scope\.txt|ledger\.md|task-\d+\.md)`;
const CONTROL_WRITE = new RegExp(
  String.raw`(>>?\s*|\btee\s+(-a\s+)?)` + CONTROL +
    '|' +
    String.raw`\b(sed\s+(-[a-zA-Z]*\s+)*-i|rm|mv|truncate|Set-Content|Out-File|Add-Content|Clear-Content|Remove-Item)\b[^;&|\n]*` +
    CONTROL +
    '|' +
    String.raw`\bcp\b[^;&|\n]*\s` + CONTROL + String.raw`\s*($|[;&|])`
);

const input = readInput();
const name = agentName(input);
if (!name) process.exit(0);

const command = String((input.tool_input && input.tool_input.command) || '').replace(/\\/g, '/');
// Quoted text (commit messages, echo strings) is not a command.
const bare = command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
for (const [re, reason] of RULES) {
  if (re.test(bare)) deny(`Beltline wall (${name}): ${reason} If the task really needs it, stop with NEEDS_CONTEXT.`);
}
if (CONTROL_WRITE.test(command)) {
  deny(`Beltline wall (${name}): agents never write the factory control files (scope, ledger, briefs).`);
}
process.exit(0);
