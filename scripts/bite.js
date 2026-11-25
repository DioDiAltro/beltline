#!/usr/bin/env node
'use strict';
// "Do the new tests bite?": copies the given test files into a temporary checkout of BASE (the code before the
// task), links the dependencies of the task's checkout so a missing node_modules cannot fake a failure, runs the test
// command there with the output in a log file, removes the checkout, and prints one JSON line:
// {"bites": true|false, "exit": <code>, "tail": [last lines]}. New tests that pass on BASE prove nothing.
// Usage: node bite.js --base <commit> --dir <task checkout> --files <a.test.ts,b.test.ts> --log <file> --cmd "<test command, {files} = the files>"

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const base = arg('base');
  const dir = path.resolve(arg('dir') || process.cwd());
  const files = String(arg('files') || '').split(',').map((f) => f.trim()).filter(Boolean);
  const log = arg('log');
  const cmd = arg('cmd');
  if (!base || !files.length || !log || !cmd) {
    process.stderr.write('usage: node bite.js --base <commit> --dir <checkout> --files <a,b> --log <file> --cmd "<command with {files}>"\n');
    process.exit(2);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beltline-bite-'));
  const git = (args, cwd = dir) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  let result = { bites: false, exit: null, tail: [] };
  try {
    git(['worktree', 'add', '--detach', '--quiet', tmp, base]);
    for (const f of files) {
      const src = path.resolve(dir, f);
      const dst = path.join(tmp, path.relative(dir, src));
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    // the dependencies of the task's checkout, so the tests fail for the code and not for the setup
    for (const nm of ['node_modules']) {
      const src = path.join(dir, nm);
      if (fs.existsSync(src) && !fs.existsSync(path.join(tmp, nm))) fs.symlinkSync(src, path.join(tmp, nm), 'junction');
    }
    const command = cmd.replace(/\{files\}/g, files.map((f) => JSON.stringify(f)).join(' '));
    const r = spawnSync(command, { cwd: tmp, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const output = `$ ${command}\n${r.stdout || ''}${r.stderr || ''}\nexit=${r.status}\n`;
    fs.mkdirSync(path.dirname(path.resolve(log)), { recursive: true });
    fs.writeFileSync(log, output);
    result = { bites: r.status !== 0, exit: r.status, tail: output.trim().split('\n').slice(-12) };
  } catch (e) {
    result = { bites: false, exit: null, error: String(e.message || e).split('\n')[0], tail: [] };
  } finally {
    // remove the links first, so nothing can follow them into the real dependencies
    for (const nm of ['node_modules']) {
      const link = path.join(tmp, nm);
      try {
        if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
      } catch {
        try {
          fs.rmdirSync(link); // a Windows junction
        } catch {
          // no link
        }
      }
    }
    try {
      git(['worktree', 'remove', '--force', tmp]);
    } catch {
      fs.rmSync(tmp, { recursive: true, force: true });
      try {
        git(['worktree', 'prune']);
      } catch {
        // nothing more to clean
      }
    }
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}

main();
