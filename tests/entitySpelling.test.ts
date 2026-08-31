import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseXML, buildXML, parseAnyXML, buildAnyXML } from '@/lib/xmlParser';
import { FormQuestionnaire, FormSection, FormSubSection, FormDescription } from '@/types/form';

// XML gives you two equally-valid spellings for the same character: the literal
// and an entity reference. Both survive a parse identically, so the model alone
// cannot say which one the source used — and a build that picks one globally
// rewrites every file that chose the other.
//
// The real E-Bar corpus contains both: 33 files write &apos; inside attribute
// values (39 occurrences) while the overwhelming majority write a literal
// apostrophe, and hundreds of hand-authored HTML payloads carry numeric or HTML
// character references (&#149; &#8226; &nbsp; &raquo;) that fast-xml-parser
// deliberately does NOT decode. Re-escaping those on the way out turns
// "&#149;" into "&amp;#149;", which is not a cosmetic diff at all: it changes
// what E-Bar renders from a bullet into the literal text "&#149;".

const wrap = (body: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">\n' +
  '    <section id="2999" title="S">\n' +
  '        <subsection id="3999" title="SS">\n' +
  `${body}\n` +
  '        </subsection>\n' +
  '    </section>\n' +
  '</questionnaire>\n';

const firstSubsection = (form: FormQuestionnaire): FormSubSection =>
  (form.children[0] as FormSection).children[0] as FormSubSection;

describe('attribute value spelling is reproduced from the source, not normalised', () => {
  test('a source that writes &apos; keeps &apos;', () => {
    const xml = wrap('            <required-doc id="4999" title="Final Attorney&apos;s Certificate" preventsubmit="true"></required-doc>');
    expect(buildXML(parseXML(xml)!)).toBe(xml);
  });

  test('a source that writes a literal apostrophe keeps the literal apostrophe', () => {
    const xml = wrap('            <required-doc id="4999" title="Final Attorney\'s Certificate" preventsubmit="true"></required-doc>');
    expect(buildXML(parseXML(xml)!)).toBe(xml);
  });

  test('both spellings coexisting in one file each keep their own', () => {
    // Per-attribute, so neither spelling can win a file-wide vote over the other.
    const xml = wrap(
      '            <required-doc id="4999" title="Entity&apos;s Certificate" preventsubmit="true"></required-doc>\n' +
      '            <required-doc id="5999" title="Owner\'s Certificate" preventsubmit="true"></required-doc>'
    );
    expect(buildXML(parseXML(xml)!)).toBe(xml);
  });

  test('character references inside an attribute are not double-escaped', () => {
    const xml = wrap('            <required-doc id="4999" title="bullet &#149; and &nbsp; space" preventsubmit="true"></required-doc>');
    const out = buildXML(parseXML(xml)!);
    expect(out).not.toContain('&amp;#149;');
    expect(out).not.toContain('&amp;nbsp;');
    expect(out).toBe(xml);
  });

  test('&amp; and &lt; in an attribute survive as themselves', () => {
    const xml = wrap('            <required-doc id="4999" title="R&amp;D a &lt; b" preventsubmit="true"></required-doc>');
    expect(buildXML(parseXML(xml)!)).toBe(xml);
  });

  test('an attribute the user actually edits is escaped correctly and reparses to what was typed', () => {
    const xml = wrap('            <required-doc id="4999" title="Old" preventsubmit="true"></required-doc>');
    const form = parseXML(xml)!;
    const doc = firstSubsection(form).children[0] as { title: string };
    doc.title = 'R&D "quoted" <angle> it\'s here';
    const out = buildXML(form);
    const reparsed = parseXML(out);
    expect(reparsed).not.toBeNull();
    const roundTripped = firstSubsection(reparsed as FormQuestionnaire).children[0] as { title: string };
    expect(roundTripped.title).toBe('R&D "quoted" <angle> it\'s here');
  });
});

describe('bare (non-CDATA) text payload spelling is reproduced from the source', () => {
  test('character references in bare text are not double-escaped', () => {
    const xml = wrap('            <description id="4999" prefix="">R&amp;D &#149; a &lt; b &nbsp; end</description>');
    const out = buildXML(parseXML(xml)!);
    expect(out).not.toContain('&amp;#149;');
    expect(out).not.toContain('&amp;nbsp;');
    expect(out).toBe(xml);
  });

  test('a bare-text payload the user edits is escaped and reparses to what was typed', () => {
    const xml = wrap('            <description id="4999" prefix="">plain</description>');
    const form = parseXML(xml)!;
    const desc = firstSubsection(form).children[0] as FormDescription;
    desc.text = 'R&D <b> & more';
    const out = buildXML(form);
    const reparsed = parseXML(out);
    expect(reparsed).not.toBeNull();
    const desc2 = firstSubsection(reparsed as FormQuestionnaire).children[0] as FormDescription;
    expect(desc2.text).toBe('R&D <b> & more');
  });

  test('an unknown element preserved verbatim keeps its character references', () => {
    const xml = wrap('            <previousanswer id="4999" note="a &#149; b">text &#8226; here &amp; there</previousanswer>');
    const out = buildXML(parseXML(xml)!);
    expect(out).not.toContain('&amp;#149;');
    expect(out).not.toContain('&amp;#8226;');
    expect(out).toBe(xml);
  });
});

// ---------------------------------------------------------------------------
// The synthetic cases above are derived from a real file; this pins the real
// one so the fixtures can never drift away from what the corpus actually holds.
// ---------------------------------------------------------------------------
const STATES_DIR = process.env.EBAR_STATES_DIR || '/Users/cankilic/Desktop/XML-FORMS/states';
const APOS_XML_PATH = path.join(STATES_DIR, 'va', 'xml', 'forms', 'bar-examination-carry-forward.xml');
const aposCorpusAvailable = fs.existsSync(APOS_XML_PATH);

describe.skipIf(!aposCorpusAvailable)('real corpus file containing &apos;', () => {
  test('va/bar-examination-carry-forward.xml round-trips byte-for-byte', () => {
    const src = fs.readFileSync(APOS_XML_PATH, 'utf-8');
    // fixture assumption: this is one of the 33 corpus files spelling it &apos;
    expect(src).toContain('title="Final Attorney&apos;s Certificate"');
    const form = parseAnyXML(src);
    expect(form).not.toBeNull();
    const out = buildAnyXML(form!);
    expect(out).toContain('title="Final Attorney&apos;s Certificate"');
    expect(out).toBe(src);
  });
});

describe('a start tag written with a space before the bracket', () => {
  // "<description ... >" and "<description ...>" are the same element, so the
  // parser reports them identically and the builder always picks the second.
  // The spelling is recorded per node (_startTagClose) and reapplied through an
  // internal marker attribute — which the text-payload branch of the splice has
  // to resolve as well, since it swallows the whole start tag.
  const SPACED_START_TAGS_XML =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<questionnaire id="1999" nextid="50" suffix="999" order="0" title="T">\n' +
    '    <section id="2999" title="S">\n' +
    '        <subsection id="3999" title="SS" >\n' +
    // text-bearing, CDATA payload - the case that used to leak the marker
    '            <description id="4999" prefix="" ><![CDATA[spaced start tag]]></description>\n' +
    // text-bearing, bare text payload
    '            <description id="5999" prefix="" >bare text here</description>\n' +
    // text-bearing, own-line CDATA layout
    '            <description id="6999" prefix="" >\n' +
    '                <![CDATA[expanded]]>\n' +
    '            </description>\n' +
    // empty elements, both self-closing spellings
    '            <validator id="7999" validatorclass="a" />\n' +
    '            <validator id="8999" validatorclass="b"/>\n' +
    // empty element, spaced but not self-closing
    '            <validator id="9999" validatorclass="c" ></validator>\n' +
    '        </subsection>\n' +
    '    </section>\n' +
    '</questionnaire>\n';

  test('round-trips byte-for-byte', () => {
    const form = parseXML(SPACED_START_TAGS_XML);
    expect(form).not.toBeNull();
    expect(buildXML(form!)).toBe(SPACED_START_TAGS_XML);
  });

  test('leaks no internal marker or placeholder token', () => {
    const out = buildXML(parseXML(SPACED_START_TAGS_XML)!);
    expect(out).not.toMatch(/__ffclose/);
    expect(out).not.toMatch(/__FFTXT_\d+__/);
    expect(out).not.toMatch(/__FFRAW_\d+__/);
    expect(out).not.toMatch(/__BOOL_(TRUE|FALSE)__/);
  });

  test('an edited node keeps its start-tag spelling and the edit', () => {
    const form = parseXML(SPACED_START_TAGS_XML)!;
    const ss = firstSubsection(form);
    const desc = ss.children.find(c => c.id === '4999') as FormDescription;
    desc.text = 'edited payload';
    const out = buildXML(form);
    expect(out).toContain('<description id="4999" prefix="" ><![CDATA[edited payload]]></description>');
    expect(out).not.toMatch(/__ffclose/);
  });
});
