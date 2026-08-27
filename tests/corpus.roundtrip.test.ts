import { describe, test, expect } from 'vitest';
import { parseAnyXML, buildAnyXML } from '@/lib/xmlParser';
import { listCorpusFiles, readCorpusFile, corpusAvailable } from './helpers/corpus';
import { diffXML } from '@/lib/canonicalDiff';

// Round-trip every real E-Bar form through FormForge's parse + build and
// verify the E-Bar engine would see an identical form. This is the
// "nothing is ever silently lost" guarantee.

describe.skipIf(!corpusAvailable())('E-Bar corpus round-trip', () => {
  const files = listCorpusFiles();

  test('corpus is present and non-trivial', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  test('every corpus form round-trips with zero semantic loss', () => {
    const failures: string[] = [];
    let parsed = 0;

    for (const f of files) {
      const xml = readCorpusFile(f);
      const form = parseAnyXML(xml);
      if (!form) {
        failures.push(`${f.state}/${f.kind}/${f.file}: PARSE FAILED`);
        continue;
      }
      parsed++;
      const rebuilt = buildAnyXML(form);
      const diffs = diffXML(xml, rebuilt);
      if (diffs.length > 0) {
        const shown = diffs.slice(0, 5)
          .map(d => `    [${d.kind}] ${d.path}: ${d.detail}`)
          .join('\n');
        failures.push(`${f.state}/${f.kind}/${f.file}: ${diffs.length} diffs\n${shown}`);
      }
    }

    if (failures.length > 0) {
      const summary = `${failures.length}/${files.length} files failed round-trip (parsed: ${parsed})`;
      expect.fail(`${summary}\n\n${failures.slice(0, 25).join('\n')}`);
    }
    expect(parsed).toBe(files.length);
  });

  test('rebuild is idempotent and leaks no internal placeholders', () => {
    const failures: string[] = [];

    for (const f of files) {
      const xml = readCorpusFile(f);
      const form = parseAnyXML(xml);
      if (!form) continue;
      const once = buildAnyXML(form);

      if (/__BOOL_(TRUE|FALSE)__|__FFRAW_\d+__|__FFTXT_\d+__|__ffclose/.test(once)) {
        failures.push(`${f.state}/${f.kind}/${f.file}: internal placeholder leaked into output`);
        continue;
      }

      const reparsed = parseAnyXML(once);
      if (!reparsed) {
        failures.push(`${f.state}/${f.kind}/${f.file}: rebuilt XML failed to re-parse`);
        continue;
      }
      const twice = buildAnyXML(reparsed);
      if (once !== twice) {
        failures.push(`${f.state}/${f.kind}/${f.file}: second rebuild differs from first`);
      }
    }

    if (failures.length > 0) {
      expect.fail(`${failures.length} files unstable\n${failures.slice(0, 10).join('\n')}`);
    }
  });
});

// ===========================================================================
// Byte-exact no-op gate.
//
// The semantic round-trip above proves E-Bar would read the same form back.
// This proves something much stronger and much more useful to a human: opening
// a real form and saving it without editing anything produces the SAME BYTES,
// so a one-line edit shows up in git as a one-line diff instead of drowning in
// reformatting noise. Everything in this suite exists because a real corpus
// file was being silently rewritten.
// ===========================================================================
describe.skipIf(!corpusAvailable())('E-Bar corpus byte-exact no-op save', () => {
  const files = listCorpusFiles();

  // ------------------------------------------------------------------
  // Known exclusions, listed file by file rather than hidden behind a skip.
  //
  // Everything here is a formatting or content-model gap that predates this
  // suite, is covered by the semantic round-trip test above (E-Bar reads an
  // identical form back from every one of them), and needs a feature rather
  // than a fix. Each list is exact: a file that starts passing must be removed
  // from it, and a file that starts failing cannot be quietly added, because
  // the counts are asserted below.
  // ------------------------------------------------------------------

  // The builder regenerates indentation from ONE indent unit per file. These
  // files indent with a mixture of tabs and spaces, or at depths that do not
  // follow their own nesting, so a single unit cannot reproduce them. Fixing
  // this means recording each element's own leading whitespace and emitting
  // layout from the source instead of from the pretty-printer.
  const MIXED_INDENTATION = new Set<string>([
    'az/forms/bar-exam-courtesy-seating.xml',
    'ga/forms/admissiononmotion.xml',
    'ga/forms/authorization-and-release.xml',
    'ga/forms/foreignlawconsultant.xml',
    'ilg/forms/admissiononmotion.xml',
    'ilg/forms/barapp-1sttimefiler.xml',
    'ilg/forms/barapp-reinstatement.xml',
    'ilg/forms/barapp-retake-mostrecent.xml',
    'ilg/forms/barapp-retake.xml',
    'ilg/forms/foreignlawconsultant.xml',
    'ilg/forms/pursuant-to-rule-8.09.xml',
    'in/forms/ube.xml',
    'ok/forms/repeat-exam-application.xml',
    'or/forms/bar-exam.xml',
    'sc/forms/rule414-limited-certificate-admission-clinical-teachers-application.xml',
    'sc/forms/rule427-limited-certificate-judge-advocates-application.xml',
    'ut/forms/disbarred-resigned.xml',
    'va/forms/awox.xml',
    'va/forms/legal-aid-counsel.xml',
    'wa/forms/rule-certification.xml',
  ]);

  // Whitespace-only text between elements (a stray tab after </question>, a
  // blank line before </subform>) carries no information the model keeps, so
  // the pretty-printer replaces it with its own. Same root cause as above: the
  // formatter owns whitespace, the source does not.
  const WHITESPACE_ONLY_LINES = new Set<string>([
    'al/subforms/description-of-condition-impairment.xml',
    'az/forms/bar-exam-reapplication.xml',
    'az/forms/bar-exam-short.xml',
    'az/subforms/formal-informal-disciplinary-proceedings.xml',
    'az/subforms/resigned-in-lieu.xml',
    'ct/forms/characterandfitness-ahc.xml',
    'il/forms/intent-to-transfer-remote.xml',
    'ilg/forms/characterandfitness-update.xml',
    'ilg/forms/characterandfitness-update_backup.xml',
    'ilg/forms/characterandfitness.xml',
    'ilgnow/forms/characterandfitness-update.xml',
    'ilgnow/forms/characterandfitness.xml',
    'ilgnow/forms/rule810.xml',
    'in/forms/graduatelegalinternship.xml',
    'in/forms/testing-accommodations.xml',
    'mo/forms/ocdc-reinstatement-application.xml',
    'or/forms/sppe.xml',
    'or/forms/ubet.xml',
    'sc/forms/characterandfitness-provisional.xml',
    'ut/forms/attestation-motion.xml',
    'ut/forms/attestation.xml',
    'ut/forms/house-counsel.xml',
    'ut/forms/military-spouse.xml',
    'ut/forms/motion.xml',
    'va/forms/military-legal-assistance.xml',
    'wa/forms/application-certification.xml',
    'wa/forms/law-clerk-certification.xml',
    'wa/forms/scr-emeritus.xml',
  ]);

  // A genuine content-model limit rather than a formatting one. These files
  // interleave a CDATA section with bare text inside one element
  // (<description><![CDATA[a]]> . </description>). The model holds a single
  // text string per node, so the two runs fold together and the bare text is
  // re-emitted inside the CDATA. E-Bar reads the same text either way.
  // Representing this needs a run list per text node, and an editor for it.
  const INTERLEAVED_CDATA_AND_TEXT = new Set<string>([
    'al/forms/characterandfitness.xml',
    'dc/forms/prohacvice.xml',
    'ilgnow/forms/barapp-retake.xml',
    'tx/forms/attorneys-licensed-inantoher-state-application.xml',
    'tx/forms/awox-application-foreign-trained.xml',
    'tx/forms/awox-application-state-accredited.xml',
    'tx/forms/awox-application.xml',
    'tx/forms/foreign-trained-application.xml',
    'tx/forms/military-spouse-temporary-license-application.xml',
    'tx/forms/re-application.xml',
    'tx/forms/ube-transfer-application-attorneys-aba-approved.xml',
    'tx/forms/ube-transfer-application-foreign-trained-applicants.xml',
    'tx/forms/ube-transfer-application-in-state-students.xml',
    'tx/forms/ube-transfer-application-non-aba.xml',
    'tx/forms/ube-transfer-application-out-of-state-students.xml',
    'tx/forms/ube-transfer-application-with-aba.xml',
  ]);

  const EXCLUDED = new Map<string, string>([
    ...[...MIXED_INDENTATION].map(f => [f, 'mixed indentation'] as [string, string]),
    ...[...WHITESPACE_ONLY_LINES].map(f => [f, 'whitespace-only text between elements'] as [string, string]),
    ...[...INTERLEAVED_CDATA_AND_TEXT].map(f => [f, 'interleaved CDATA and bare text'] as [string, string]),
  ]);

  test('corpus is present and non-trivial', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  test('every corpus form re-saves byte-for-byte with no edits', () => {
    const failures: string[] = [];
    const excluded: string[] = [];
    let identical = 0;

    for (const f of files) {
      const key = `${f.state}/${f.kind}/${f.file}`;
      const xml = readCorpusFile(f);
      const form = parseAnyXML(xml);
      if (!form) {
        failures.push(`${key}: PARSE FAILED`);
        continue;
      }
      const rebuilt = buildAnyXML(form);
      if (rebuilt === xml) {
        identical++;
        // an excluded file that starts passing means the exclusion is stale
        if (EXCLUDED.has(key)) failures.push(`${key}: listed as a known exclusion but is now byte-exact - remove it from the list`);
        continue;
      }
      if (EXCLUDED.has(key)) {
        excluded.push(key);
        continue;
      }

      // First differing line, with enough context to act on.
      const src = xml.split(/\r?\n/);
      const out = rebuilt.split(/\r?\n/);
      let detail = `line counts ${src.length} -> ${out.length}, no differing line found`;
      for (let i = 0; i < Math.min(src.length, out.length); i++) {
        if (src[i] !== out[i]) {
          detail = `line ${i + 1}\n      - ${JSON.stringify(src[i].slice(0, 200))}\n      + ${JSON.stringify(out[i].slice(0, 200))}`;
          break;
        }
      }
      failures.push(`${key}: ${detail}`);
    }

    // Denominator is always reported, pass or fail - no silent skips.
    const summary =
      `${identical}/${files.length} byte-exact, ` +
      `${excluded.length} excluded (${MIXED_INDENTATION.size} mixed indentation, ` +
      `${WHITESPACE_ONLY_LINES.size} whitespace-only text, ` +
      `${INTERLEAVED_CDATA_AND_TEXT.size} interleaved CDATA/text), ` +
      `${failures.length} failed`;

    if (failures.length > 0) {
      expect.fail(`${summary}\n\n${failures.slice(0, 20).join('\n')}`);
    }
    expect(identical + excluded.length).toBe(files.length);
    expect(excluded.length).toBe(EXCLUDED.size);
  });
});
