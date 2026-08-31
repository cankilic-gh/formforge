import { describe, test, expect } from 'vitest';
import { parseXML, buildXML } from '@/lib/xmlParser';
import { extractHrefs, hasLinks } from '@/lib/linkUtils';
import { validateForm } from '@/lib/validation';
import { diffXML } from '@/lib/canonicalDiff';
import { FormQuestionnaire, FormSection, FormSubSection, FormQuestion, FormDescription } from '@/types/form';

// Regression guard for the "invisible hyperlink" bug: anchors inside CDATA are
// real content (see co/ube-score-transfer-application.xml) and must survive
// both the tree's label handling and a parse -> edit -> build round-trip.

const LINK = '<a href="https://ncbex.org/exams/mpre/registration/" target="_blank">click here</a>';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="100001" nextid="20" suffix="00001" title="Link Fixture">
    <section id="200001" title="Scores">
        <subsection id="300001" title="UBE Transfer Score">
            <description id="400001" prefix=""><![CDATA[Instructions can be found on the <a href="https://www.ncbex.org/exams/ube" target="_blank">National Conference of Bar Examiners</a> website.]]></description>
            <question id="500001" type="char" required="" format="" triggervalue="" comment="">
                <description id="600001" prefix=""><![CDATA[<p>To register for the next MPRE ${LINK}.</p>]]></description>
            </question>
        </subsection>
    </section>
</questionnaire>`;

const firstQuestionDescription = (form: FormQuestionnaire): FormDescription => {
  const section = form.children[0] as FormSection;
  const ss = section.children[0] as FormSubSection;
  const q = ss.children.find((c) => c.nodeType === 'question') as FormQuestion;
  return q.children.find((c) => c.nodeType === 'description') as FormDescription;
};

describe('tree link detection', () => {
  test('detects anchors the plain-text label would erase', () => {
    expect(extractHrefs(`Register ${LINK}.`)).toEqual(['https://ncbex.org/exams/mpre/registration/']);
    expect(hasLinks(`Register ${LINK}.`)).toBe(true);
  });

  test('counts every anchor and ignores link-free text', () => {
    const two = `<a href="https://a.test/">a</a> and <a href='https://b.test/'>b</a>`;
    expect(extractHrefs(two)).toEqual(['https://a.test/', 'https://b.test/']);
    expect(hasLinks('<p>plain <strong>text</strong></p>')).toBe(false);
    expect(hasLinks('')).toBe(false);
  });
});

describe('anchor survives the editor onChange path and XML round-trip', () => {
  test('parse -> build keeps the anchor and both attributes', () => {
    const form = parseXML(XML)!;
    expect(form).not.toBeNull();

    const desc = firstQuestionDescription(form);
    expect(desc.text).toContain('href="https://ncbex.org/exams/mpre/registration/"');
    expect(desc.text).toContain('target="_blank"');

    const out = buildXML(form);
    expect(out).toContain('href="https://ncbex.org/exams/mpre/registration/"');
    expect(out).toContain('href="https://www.ncbex.org/exams/ube"');
    expect(out).toContain('target="_blank"');
    expect(diffXML(XML, out)).toHaveLength(0);
  });

  test('editing surrounding text leaves the anchor byte-identical', () => {
    const form = parseXML(XML)!;
    const desc = firstQuestionDescription(form);

    // what RichTextEditor's onChange writes back after an unrelated text edit
    desc.text = desc.text.replace('To register for the next MPRE', 'To register for the upcoming MPRE');

    const out = buildXML(form);
    expect(out).toContain(LINK);
    expect(out).toContain('upcoming MPRE');
    expect(validateForm(form).filter((e) => e.type === 'error')).toHaveLength(0);
  });

  test('rebuild stays stable across a second round-trip', () => {
    const once = buildXML(parseXML(XML)!);
    const twice = buildXML(parseXML(once)!);
    expect(twice).toBe(once);
    expect(twice).toContain(LINK);
  });
});
