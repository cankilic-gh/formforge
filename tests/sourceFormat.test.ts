import { describe, test, expect } from 'vitest';
import { parseXML, buildXML } from '@/lib/xmlParser';

// Regression guard for a real bug: fast-xml-parser's builder always emits LF
// + 4-space indent regardless of the source file. ~97% of the real E-Bar
// corpus is CRLF (many also tab-indented), so an untouched round-trip used to
// turn EVERY line of those files into a git diff, even with zero semantic
// changes — this is exactly what made a small AI Fix edit look like the
// entire file had been rewritten. See src/lib/xmlParser.ts detectSourceFormat
// / applySourceLineEnding.

const CRLF_TAB_XML =
  '<?xml version="1.0" encoding="utf-8"?>\r\n' +
  '<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">\r\n' +
  '\t<section id="2999" title="S">\r\n' +
  '\t\t<subsection id="3999" title="SS">\r\n' +
  '\t\t\t<question id="4999" type="char" format="" required="" triggervalue="" comment="">\r\n' +
  '\t\t\t\t<description id="5999" prefix=""><![CDATA[Full Name]]></description>\r\n' +
  '\t\t\t</question>\r\n' +
  '\t\t</subsection>\r\n' +
  '\t</section>\r\n' +
  '</questionnaire>\r\n';

const LF_SPACE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">
    <section id="2999" title="S">
        <subsection id="3999" title="SS">
            <question id="4999" type="char" format="" required="" triggervalue="" comment="">
                <description id="5999" prefix=""><![CDATA[Full Name]]></description>
            </question>
        </subsection>
    </section>
</questionnaire>
`;

const countEndings = (s: string) => ({
  crlf: (s.match(/\r\n/g) || []).length,
  bareLf: (s.match(/(?<!\r)\n/g) || []).length,
});

describe('source format preservation (CRLF/tabs vs LF/spaces)', () => {
  test('a CRLF + tab source round-trips to CRLF with zero bare LF', () => {
    const form = parseXML(CRLF_TAB_XML);
    expect(form).not.toBeNull();
    const rebuilt = buildXML(form!);
    const { crlf, bareLf } = countEndings(rebuilt);
    expect(bareLf).toBe(0);
    expect(crlf).toBeGreaterThan(0);
  });

  test('a CRLF + tab source round-trips using tab indentation, not 4 spaces', () => {
    const form = parseXML(CRLF_TAB_XML);
    const rebuilt = buildXML(form!);
    // The <section> line (depth 1) must be indented with a literal tab.
    expect(rebuilt).toMatch(/\r\n\t<section/);
    expect(rebuilt).not.toMatch(/\r\n {4}<section/);
  });

  test('an LF + 4-space source still round-trips to LF with zero CRLF (no regression for the common case)', () => {
    const form = parseXML(LF_SPACE_XML);
    expect(form).not.toBeNull();
    const rebuilt = buildXML(form!);
    const { crlf, bareLf } = countEndings(rebuilt);
    expect(crlf).toBe(0);
    expect(bareLf).toBeGreaterThan(0);
  });

  test('a freshly-created form (no _sourceFormat) defaults to LF + 4 spaces', () => {
    const form = parseXML(LF_SPACE_XML)!;
    delete form._sourceFormat;
    const rebuilt = buildXML(form);
    expect(countEndings(rebuilt).crlf).toBe(0);
    expect(rebuilt).toMatch(/\n {4}<section/);
  });

  test('CDATA text that already contains a literal CRLF is not double-converted', () => {
    const xmlWithCrlfInText =
      '<?xml version="1.0" encoding="utf-8"?>\r\n' +
      '<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">\r\n' +
      '\t<section id="2999" title="S">\r\n' +
      '\t\t<subsection id="3999" title="SS">\r\n' +
      '\t\t\t<description id="5999" prefix=""><![CDATA[Line one\r\nLine two]]></description>\r\n' +
      '\t\t</subsection>\r\n' +
      '\t</section>\r\n' +
      '</questionnaire>\r\n';
    const form = parseXML(xmlWithCrlfInText);
    const rebuilt = buildXML(form!);
    // Must stay a single \r\n between "one" and "Line two" — never \r\r\n.
    expect(rebuilt).toContain('Line one\r\nLine two');
    expect(rebuilt).not.toContain('Line one\r\r\n');
  });
});
