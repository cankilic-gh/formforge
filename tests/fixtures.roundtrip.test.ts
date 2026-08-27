import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseAnyXML, buildAnyXML } from '@/lib/xmlParser';
import { diffXML } from '@/lib/canonicalDiff';
import { walkNodes } from '@/lib/validation';
import type { FormNode, FormUnknown } from '@/types/form';

// Vendored fixtures so the round-trip guarantee is verified on EVERY machine
// and in CI - the real corpus suite (corpus.roundtrip.test.ts) only runs where
// the E-Bar repos are checked out.

const fixturesDir = path.join(__dirname, 'fixtures');
const fixtures = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.xml'));

describe('fixture round-trip (always runs)', () => {
  test('fixtures are present', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of fixtures) {
    const xml = fs.readFileSync(path.join(fixturesDir, file), 'utf-8');

    test(`${file}: round-trips with zero semantic loss`, () => {
      const form = parseAnyXML(xml);
      expect(form).not.toBeNull();
      const rebuilt = buildAnyXML(form!);
      const diffs = diffXML(xml, rebuilt);
      expect(diffs, JSON.stringify(diffs, null, 2)).toHaveLength(0);
    });

    test(`${file}: rebuild is idempotent and leaks no placeholders`, () => {
      const form = parseAnyXML(xml)!;
      const once = buildAnyXML(form);
      expect(once).not.toMatch(/__BOOL_(TRUE|FALSE)__|__FFRAW_\d+__|__FFTXT_\d+__|__ffclose/);
      const reparsed = parseAnyXML(once);
      expect(reparsed).not.toBeNull();
      expect(buildAnyXML(reparsed!)).toBe(once);
    });
  }

  test('mixed-content description is preserved as unknown, nothing else is', () => {
    const xml = fs.readFileSync(path.join(fixturesDir, 'questionnaire.sample.xml'), 'utf-8');
    const form = parseAnyXML(xml)!;
    const unknowns: FormUnknown[] = [];
    walkNodes(form as FormNode, (n) => {
      if (n.nodeType === 'unknown') unknowns.push(n as FormUnknown);
    });
    expect(unknowns).toHaveLength(1);
    expect(unknowns[0].tagName).toBe('description');
  });
});
