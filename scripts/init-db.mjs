#!/usr/bin/env node
/**
 * Runs the SQL Server schema, function and seed scripts in order.
 * Usage: node scripts/init-db.mjs --server localhost --user sa [--no-seed]
 * Password is read from the SQLCMDPASSWORD environment variable so it never
 * appears in shell history or process arguments.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(here, '..', 'database');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const server = flag('server', 'localhost');
const user = flag('user', null);
const database = flag('database', 'ClearPath');
const skipSeed = args.includes('--no-seed');

if (!process.env.SQLCMDPASSWORD && user) {
  console.error('Set SQLCMDPASSWORD before running with --user.');
  process.exit(1);
}

const steps = [
  { file: '01_schema.sql', db: 'master' },
  { file: '02_functions.sql', db: database },
  ...(skipSeed ? [] : [{ file: '03_seed-data.sql', db: database }]),
];

for (const step of steps) {
  const sqlcmdArgs = ['-S', server, '-d', step.db, '-b', '-i', path.join(databaseDir, step.file)];
  if (user) sqlcmdArgs.push('-U', user);
  else sqlcmdArgs.push('-E');

  console.log(`Running ${step.file} against ${server}/${step.db}…`);
  const result = spawnSync('sqlcmd', sqlcmdArgs, { stdio: 'inherit' });
  if (result.error) {
    console.error('sqlcmd was not found. Install the SQL Server command line tools.');
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${step.file} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

console.log('Database initialization complete.');
