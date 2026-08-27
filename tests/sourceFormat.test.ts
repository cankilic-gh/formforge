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

  test('a file that deliberately writes CDATA leaves multi-line (e.g. VA forms) does not get its closing tags wrongly collapsed', () => {
    // Real regression: collapsing "]]>" + newline + closing tag unconditionally
    // fixed inline-convention files (most of the corpus) but corrupted this
    // convention — a real VA form failed the corpus round-trip test this way.
    const multilineCdataXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">\n' +
      '    <section id="2999" title="S">\n' +
      '        <subsection id="3999" title="SS">\n' +
      '            <description id="5999" prefix="">\n' +
      '                <![CDATA[I, ]]>\n' +
      '            </description>\n' +
      '            <description id="6999" prefix="">\n' +
      '                <![CDATA[hereby apply]]>\n' +
      '            </description>\n' +
      '        </subsection>\n' +
      '    </section>\n' +
      '</questionnaire>\n';
    const form = parseXML(multilineCdataXml);
    expect(form).not.toBeNull();
    expect(form!._sourceFormat?.cdataInlineClosing).toBe(false);
    const rebuilt = buildXML(form!);
    // The closing tag must stay on its own line — not fused onto the CDATA line.
    expect(rebuilt).toMatch(/\]\]>\r?\n\s*<\/description>/);
  });

  test('a file that deliberately writes CDATA leaves with the opening tag alone on its own line (e.g. GA characterandfitness.xml) preserves that shape, not glued to the opening tag', () => {
    // Real regression: a third real convention, distinct from both cases above -
    // the opening tag sits alone on its own line, and the CDATA content (with
    // its closing tag also on its own line) starts on the next line down. The
    // builder always glues CDATA onto the same line as the opening tag, so
    // without this fix every such leaf gets reformatted on every save.
    const openTagAloneXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">\n' +
      '    <section id="2999" title="S">\n' +
      '        <subsection id="3999" title="SS">\n' +
      '            <description id="5999" prefix="">\n' +
      '                <![CDATA[I, ]]>\n' +
      '            </description>\n' +
      '            <option id="6999" value="yes">\n' +
      '                <![CDATA[Yes]]>\n' +
      '            </option>\n' +
      '        </subsection>\n' +
      '    </section>\n' +
      '</questionnaire>\n';
    const form = parseXML(openTagAloneXml);
    expect(form).not.toBeNull();
    expect(form!._sourceFormat?.cdataOwnLine).toBe(true);
    const rebuilt = buildXML(form!);
    // The opening tag must stay alone on its own line - not fused to "<![CDATA[".
    expect(rebuilt).toMatch(/<description id="5999" prefix="">\n\s*<!\[CDATA\[I, \]\]>\n\s*<\/description>/);
    expect(rebuilt).toMatch(/<option id="6999" value="yes">\n\s*<!\[CDATA\[Yes\]\]>\n\s*<\/option>/);
    expect(rebuilt).not.toContain('prefix=""><![CDATA[');
    expect(rebuilt).not.toContain('value="yes"><![CDATA[');
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

describe('CDATA layout is preserved per node, not per file', () => {
  // All four layouts a text-bearing leaf can have, in ONE document, with the
  // minority deliberately outnumbered 3:1 on each axis. Any whole-file majority
  // vote — which is what FormForge used to do — must rewrite the minority here.
  // 34 files in the real E-Bar corpus mix layouts exactly like this
  // (va/xml/forms/bar-exam.xml: 4 glued CDATA leaves among 125 own-line ones).
  const MIXED_LAYOUTS_XML =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">\n' +
    '    <section id="2999" title="S">\n' +
    '        <subsection id="3999" title="SS">\n' +
    // 1. glued open, inline close (the common corpus convention)
    '            <description id="4999" prefix=""><![CDATA[glued and inline]]></description>\n' +
    // 2. own-line open, own-line close (GA characterandfitness / CO convention)
    '            <description id="5999" prefix="">\n' +
    '                <![CDATA[fully expanded]]>\n' +
    '            </description>\n' +
    // 3. glued open, own-line close (the VA convention)
    '            <description id="6999" prefix=""><![CDATA[glued open only]]>\n' +
    '            </description>\n' +
    // 4. own-line open, inline close
    '            <option id="7999" value="x">\n' +
    '                <![CDATA[own-line open only]]></option>\n' +
    // three more of layout 1 so a majority vote would flatten 2, 3 and 4
    '            <description id="8999" prefix=""><![CDATA[majority a]]></description>\n' +
    '            <description id="9999" prefix=""><![CDATA[majority b]]></description>\n' +
    '            <description id="10999" prefix=""><![CDATA[majority c]]></description>\n' +
    '        </subsection>\n' +
    '    </section>\n' +
    '</questionnaire>\n';

  test('a file mixing all four CDATA layouts round-trips byte-for-byte', () => {
    const form = parseXML(MIXED_LAYOUTS_XML);
    expect(form).not.toBeNull();
    expect(buildXML(form!)).toBe(MIXED_LAYOUTS_XML);
  });

  test('the minority layouts survive even though the file-wide vote is against them', () => {
    // The file-level detection genuinely votes the other way on both axes...
    const form = parseXML(MIXED_LAYOUTS_XML)!;
    expect(form._sourceFormat?.cdataInlineClosing).toBe(true);
    expect(form._sourceFormat?.cdataOwnLine).toBe(false);
    // ...yet each node keeps its own shape.
    const out = buildXML(form);
    expect(out).toContain('<description id="5999" prefix="">\n                <![CDATA[fully expanded]]>\n            </description>');
    expect(out).toContain('<description id="6999" prefix=""><![CDATA[glued open only]]>\n            </description>');
    expect(out).toContain('<option id="7999" value="x">\n                <![CDATA[own-line open only]]></option>');
  });

  test('each node records its own layout at parse time', () => {
    const form = parseXML(MIXED_LAYOUTS_XML)!;
    const section = form.children[0] as { children: { children: { id: string; _textLayout?: unknown }[] }[] };
    const byId = new Map(section.children[0].children.map(c => [c.id, c._textLayout]));
    expect(byId.get('4999')).toEqual({ cdata: true, openOwnLine: false, closeOwnLine: false });
    expect(byId.get('5999')).toEqual({ cdata: true, openOwnLine: true, closeOwnLine: true });
    expect(byId.get('6999')).toEqual({ cdata: true, openOwnLine: false, closeOwnLine: true });
    expect(byId.get('7999')).toEqual({ cdata: true, openOwnLine: true, closeOwnLine: false });
  });

  test('a node created fresh in the editor follows the file\'s dominant convention', () => {
    // No _textLayout of its own - it must not come out looking like FormForge's
    // default when the file it is being inserted into writes CDATA differently.
    const ownLineFile =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">\n' +
      '    <section id="2999" title="S">\n' +
      '        <subsection id="3999" title="SS">\n' +
      '            <description id="4999" prefix="">\n' +
      '                <![CDATA[existing]]>\n' +
      '            </description>\n' +
      '        </subsection>\n' +
      '    </section>\n' +
      '</questionnaire>\n';
    const form = parseXML(ownLineFile)!;
    const section = form.children[0] as { children: { children: unknown[] }[] };
    section.children[0].children.push({ id: '5999', nodeType: 'description', prefix: '', text: 'brand new' });
    const out = buildXML(form);
    expect(out).toContain('<description id="5999" prefix="">\n                <![CDATA[brand new]]>\n            </description>');
  });

  test('multi-line CDATA text keeps the document line ending on every internal line', () => {
    const crlfMultiline =
      '<?xml version="1.0" encoding="UTF-8"?>\r\n' +
      '<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">\r\n' +
      '    <section id="2999" title="S">\r\n' +
      '        <subsection id="3999" title="SS">\r\n' +
      '            <description id="4999" prefix="">\r\n' +
      '                <![CDATA[<p>one</p>\r\n<p>two</p>\r\n<p>three</p>]]>\r\n' +
      '            </description>\r\n' +
      '        </subsection>\r\n' +
      '    </section>\r\n' +
      '</questionnaire>';
    const form = parseXML(crlfMultiline);
    expect(form).not.toBeNull();
    const out = buildXML(form!);
    expect(out).toBe(crlfMultiline);
    expect(out).not.toMatch(/[^\r]\n/);
  });
});
