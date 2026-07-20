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

      if (/__BOOL_(TRUE|FALSE)__|__FFRAW_\d+__/.test(once)) {
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
