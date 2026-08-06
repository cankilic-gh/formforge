/* eslint-disable no-console */
// Batch-validate every form/subform under a directory tree, in one process.
// Usage: npx tsx scripts/scan-corpus.ts <rootDir> [--warnings]
//   Prints, per file that has findings, the error (and optionally warning) messages.
//   Exit 0 always; this is a triage tool, not a gate.

import fs from 'fs';
import path from 'path';
import { parseAnyXML } from '../src/lib/xmlParser';
import { validateForm } from '../src/lib/validation';

const root = process.argv[2];
const showWarnings = process.argv.includes('--warnings');
if (!root) {
  console.error('usage: scan-corpus <rootDir> [--warnings]');
  process.exit(2);
}

const files: string[] = [];
const walk = (dir: string) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (p.endsWith('.xml') && (/[/\\]xml[/\\](forms|subforms)[/\\]/.test(p))) files.push(p);
  }
};
walk(root);
files.sort();

let scanned = 0;
let withErr = 0;
let withWarn = 0;
let parseFail = 0;
const errorTally: Record<string, number> = {};

for (const f of files) {
  scanned++;
  let form;
  try {
    form = parseAnyXML(fs.readFileSync(f, 'utf-8'));
  } catch {
    form = null;
  }
  if (!form) {
    parseFail++;
    console.log(`PARSE-FAIL  ${f}`);
    continue;
  }
  const issues = validateForm(form);
  const errs = issues.filter((i) => i.type === 'error');
  const warns = issues.filter((i) => i.type === 'warning');
  if (errs.length) withErr++;
  if (warns.length) withWarn++;
  for (const e of errs) {
    // tally by the leading phrase for a quick histogram of error kinds
    const key = e.message.replace(/id="[^"]*"/g, 'id="…"').replace(/"[0-9]+"/g, '"…"').slice(0, 80);
    errorTally[key] = (errorTally[key] || 0) + 1;
  }
  if (errs.length || (showWarnings && warns.length)) {
    const rel = f.replace(/^.*\/states\//, 'states/');
    console.log(`\n${rel}  [${errs.length} errors, ${warns.length} warnings]`);
    for (const e of errs) console.log(`  ERROR  ${e.message}`);
    if (showWarnings) for (const w of warns) console.log(`  warn   ${w.message}`);
  }
}

console.log(`\n---\nscanned ${scanned} files; ${withErr} with errors; ${withWarn} with warnings; ${parseFail} parse failures`);
if (Object.keys(errorTally).length) {
  console.log('\nerror histogram:');
  Object.entries(errorTally)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
}
