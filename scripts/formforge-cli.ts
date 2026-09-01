/* eslint-disable no-console */
// FormForge CLI - headless gate for the form-update skill.
// Usage:
//   npx tsx scripts/formforge-cli.ts validate <file.xml>
//   npx tsx scripts/formforge-cli.ts roundtrip <file.xml>
//   npx tsx scripts/formforge-cli.ts diff <original.xml> <edited.xml>
//   npx tsx scripts/formforge-cli.ts rebuild <file.xml> [out.xml]
//   npx tsx scripts/formforge-cli.ts engine-rules
//   npx tsx scripts/formforge-cli.ts gate <original.xml> <edited.xml>
// All commands print JSON to stdout; non-zero exit = gate failed.
// (engine-rules prints plain text, not JSON: it is the E-Bar engine contract
// rendered from engineModel.ts, for an agent to load as ground truth.)

import fs from 'fs';
import { parseAnyXML, buildAnyXML } from '../src/lib/xmlParser';
import { validateForm, walkNodes } from '../src/lib/validation';
import { diffXML } from '../src/lib/canonicalDiff';
import { buildEngineRulesPrompt } from '../src/lib/engineRulesPrompt';
import type { FormNode, FormUnknown } from '../src/types/form';

const read = (p: string): string => {
  if (!fs.existsSync(p)) {
    console.error(`file not found: ${p}`);
    process.exit(2);
  }
  return fs.readFileSync(p, 'utf-8');
};

const parseOrDie = (xml: string, label: string) => {
  const form = parseAnyXML(xml);
  if (!form) {
    console.log(JSON.stringify({ ok: false, error: `${label}: not a parseable questionnaire/subform` }, null, 2));
    process.exit(1);
  }
  return form;
};

const collectUnknowns = (form: ReturnType<typeof parseAnyXML>) => {
  const unknowns: { tagName: string; id: string }[] = [];
  walkNodes(form as FormNode, (n) => {
    if (n.nodeType === 'unknown') {
      const u = n as FormUnknown;
      unknowns.push({ tagName: u.tagName, id: u.id });
    }
  });
  return unknowns;
};

const [, , cmd, fileA, fileB] = process.argv;

switch (cmd) {
  case 'validate': {
    const form = parseOrDie(read(fileA), fileA);
    const issues = validateForm(form);
    const errors = issues.filter(i => i.type === 'error');
    console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings: issues.filter(i => i.type === 'warning') }, null, 2));
    process.exit(errors.length === 0 ? 0 : 1);
  }

  case 'roundtrip': {
    const xml = read(fileA);
    const form = parseOrDie(xml, fileA);
    const rebuilt = buildAnyXML(form);
    const diffs = diffXML(xml, rebuilt);
    console.log(JSON.stringify({ ok: diffs.length === 0, diffs, preservedUnknowns: collectUnknowns(form) }, null, 2));
    process.exit(diffs.length === 0 ? 0 : 1);
  }

  case 'diff': {
    // Semantic diff between two files - use to prove an edit changed ONLY what the ticket asked
    const a = read(fileA);
    const b = read(fileB);
    parseOrDie(a, fileA);
    parseOrDie(b, fileB);
    const diffs = diffXML(a, b);
    console.log(JSON.stringify({ identical: diffs.length === 0, diffCount: diffs.length, diffs }, null, 2));
    process.exit(0);
  }

  case 'rebuild': {
    const form = parseOrDie(read(fileA), fileA);
    const out = buildAnyXML(form);
    if (fileB) {
      fs.writeFileSync(fileB, out);
      console.log(JSON.stringify({ ok: true, written: fileB }, null, 2));
    } else {
      console.log(out);
    }
    process.exit(0);
  }

  // Prints the live E-Bar engine contract (elements, attributes, question
  // types, operators) generated from engineModel.ts. An agent editing forms
  // must load THIS instead of relying on memory, so its rules can never drift
  // from the same model that drives validation and the web UI.
  case 'engine-rules': {
    console.log(buildEngineRulesPrompt());
    process.exit(0);
  }

  // The single verify-before-report gate for an edited form: the edit must
  // parse, carry no validation errors, round-trip with zero semantic loss,
  // and differ from the original ONLY where intended. Prints the scope diff
  // so the caller can prove the change matches what was asked.
  case 'gate': {
    const originalXml = read(fileA);
    const editedXml = read(fileB);
    parseOrDie(originalXml, fileA); // must itself be a valid form to compare against
    const edited = parseOrDie(editedXml, fileB);

    const issues = validateForm(edited);
    const errors = issues.filter(i => i.type === 'error');

    const rebuilt = buildAnyXML(edited);
    const roundtripDiffs = diffXML(editedXml, rebuilt);

    const scope = diffXML(originalXml, editedXml);
    const ok = errors.length === 0 && roundtripDiffs.length === 0;

    console.log(JSON.stringify({
      ok,
      validation: { errors, warnings: issues.filter(i => i.type === 'warning') },
      roundtrip: { ok: roundtripDiffs.length === 0, diffs: roundtripDiffs },
      scope: { changeCount: scope.length, changes: scope },
      preservedUnknowns: collectUnknowns(edited),
    }, null, 2));
    process.exit(ok ? 0 : 1);
  }

  default:
    console.error('usage: formforge-cli <validate|roundtrip|diff|rebuild|gate|engine-rules> [file] [file2]');
    process.exit(2);
}
