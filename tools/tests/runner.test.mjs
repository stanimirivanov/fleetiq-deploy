import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { completedReceipt, recordJob } from '../ci-evidence.mjs';
import { pnpmLaunchers } from '../pnpm-launchers.mjs';
import { pinnedPnpm, run } from '../process.mjs';
import { catalogue } from '../verification-catalogue.mjs';

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'fleetiq-deploy-launchers-'));
  context.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert(directory.includes('fleetiq-deploy-launchers-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
function environment(directory) {
  const value = { ...process.env, PATH: directory };
  delete value.Path;
  delete value.npm_execpath;
  return value;
}
function cli(file, version = '12.5.1', exit = 0) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `process.stdout.write(${JSON.stringify(version)});process.exit(${exit});\n`,
  );
}

test('pnpm discovery supports native PATH and adjacent npm package executables without a shell', (context) => {
  const directory = fixture(context);
  const native = join(
    directory,
    'node_modules/pnpm',
    process.platform === 'win32' ? 'pnpm.exe' : 'pnpm',
  );
  mkdirSync(dirname(native), { recursive: true });
  copyFileSync(process.execPath, native);
  // A real native process validates execution; it is deliberately Node, not a forged pnpm binary.
  const launchers = pnpmLaunchers(directory, { environment: environment(directory) });
  assert(
    launchers.some((entry) => entry.command === native && entry.args.length === 0),
  );
  assert.equal(
    run(native, ['--eval', 'process.stdout.write("native-ok")']),
    'native-ok',
  );
  assert.throws(
    () => pinnedPnpm({ environment: environment(directory) }),
    /pinned pnpm executable/u,
  );
});

test('JavaScript/Corepack launchers require an exact successful version and ignore command shims', (context) => {
  const directory = fixture(context);
  const entry = join(directory, 'node_modules/pnpm/bin/pnpm.mjs');
  const env = environment(directory);
  cli(entry);
  assert.deepEqual(pinnedPnpm({ environment: env }), {
    command: process.execPath,
    args: [entry],
  });
  for (const [version, exit] of [
    ['12.5.2', 0],
    ['', 0],
    ['12.5.1', 2],
  ]) {
    cli(entry, version, exit);
    assert.throws(() => pinnedPnpm({ environment: env }), /pinned pnpm executable/u);
  }
  cli(entry, 'wrong-version');
  const corepack = join(directory, 'node_modules/corepack/dist/pnpm.js');
  cli(corepack);
  assert.deepEqual(pinnedPnpm({ environment: env }), {
    command: process.execPath,
    args: [corepack],
  });
  const shim = join(directory, 'pnpm.cmd');
  writeFileSync(shim, '@echo off\n');
  assert(
    !pnpmLaunchers(directory, { environment: { ...env, npm_execpath: shim } }).some(
      (v) => v.command.endsWith('.cmd') || v.args.includes(shim),
    ),
  );
});

const head = 'a'.repeat(40);
function receipt() {
  return {
    schemaVersion: 1,
    group: 'structural',
    head,
    outcome: 'passed',
    sourceBefore: 'b'.repeat(64),
    sourceAfter: 'b'.repeat(64),
    checks: catalogue.structural.map((name) => ({ name, outcome: 'passed' })),
  };
}

test('CI evidence rejects missing, skipped, changed-source, wrong-head and malformed receipts', (context) => {
  assert(completedReceipt(receipt(), 'structural', head));
  for (const mutate of [
    (v) => {
      v.checks.pop();
    },
    (v) => {
      v.checks[0].outcome = 'not-run';
    },
    (v) => {
      v.outcome = 'incomplete';
    },
    (v) => {
      v.sourceAfter = 'c'.repeat(64);
    },
    (v) => {
      v.head = 'c'.repeat(40);
    },
  ]) {
    const value = receipt();
    mutate(value);
    assert(!completedReceipt(value, 'structural', head));
  }
  const directory = fixture(context);
  assert.equal(recordJob('structural', 'success', head, directory), false);
  writeFileSync(join(directory, 'structural-123.json'), '{malformed');
  assert.equal(recordJob('structural', 'failure', head, directory), false);
  writeFileSync(join(directory, 'structural-123.json'), JSON.stringify(receipt()));
  assert.equal(recordJob('structural', 'failure', head, directory), false);
  assert.equal(recordJob('structural', 'success', head, directory), true);
  const summaries = readdirSync(directory)
    .filter((file) => file.startsWith('ci-'))
    .map((file) => JSON.parse(readFileSync(join(directory, file))));
  assert.equal(summaries.filter((v) => v.outcome === 'passed').length, 1);
  assert.equal(summaries.filter((v) => v.outcome === 'incomplete').length, 3);
});
