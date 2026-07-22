import { describe, test, expect } from 'vitest';
import { parseXML, buildXML } from '@/lib/xmlParser';
import { FormQuestionnaire, FormQuestion, FormSubSection, FormSection, FormDescription } from '@/types/form';

// Regression suite for the stale-attribute bug: clearing a value in the editor
// must remove the attribute from the output instead of resurfacing the original.

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="100001" nextid="9" suffix="00001" title="T">
    <section id="200001" title="S">
        <subsection id="300001" title="Sub" depends="400001" condition="true">
            <conditionset id="400001" operator="and"></conditionset>
            <question id="500001" type="char" maxlength="50" refname="oldref" required="true" format="" triggervalue="" comment="" ncbe_name="" isamended="true">
                <description id="600001" prefix=""><![CDATA[Q1]]></description>
            </question>
        </subsection>
    </section>
</questionnaire>`;

const load = (): FormQuestionnaire => {
  const form = parseXML(XML);
  expect(form).not.toBeNull();
  return form as FormQuestionnaire;
};

const firstQuestion = (form: FormQuestionnaire): FormQuestion => {
  const section = form.children[0] as FormSection;
  const ss = section.children[0] as FormSubSection;
  return ss.children.find(c => c.nodeType === 'question') as FormQuestion;
};

const firstSubsection = (form: FormQuestionnaire): FormSubSection => {
  const section = form.children[0] as FormSection;
  return section.children[0] as FormSubSection;
};

describe('cleared attributes do not resurface from _originalAttrs', () => {
  test('clearing maxlength and refname removes them from the output', () => {
    const form = load();
    const q = firstQuestion(form);
    q.maxlength = 0;
    q.refname = '';
    const out = buildXML(form);
    expect(out).not.toContain('maxlength=');
    expect(out).not.toContain('refname=');
  });

  test('clearing subsection depends/condition removes them from the output', () => {
    const form = load();
    const ss = firstSubsection(form);
    ss.depends = undefined;
    ss.condition = undefined;
    const out = buildXML(form);
    expect(out).not.toContain('depends=');
    expect(out).not.toContain('condition="true"');
  });

  test('unchecking isamended emits isamended="false" instead of the stale "true"', () => {
    const form = load();
    firstQuestion(form).isAmended = false;
    const out = buildXML(form);
    expect(out).toContain('isamended="false"');
  });

  test('untouched values keep their original spellings (maxlength, empty ncbe_name)', () => {
    const out = buildXML(load());
    expect(out).toContain('maxlength="50"');
    expect(out).toContain('refname="oldref"');
    expect(out).toContain('ncbe_name=""'); // empty-string original preserved
    expect(out).toContain('isamended="true"');
    expect(out).toContain('depends="400001"');
  });
});

describe('text content edge cases', () => {
  test(']]> inside description text round-trips without breaking the XML', () => {
    const form = load();
    const q = firstQuestion(form);
    const desc = q.children.find(c => c.nodeType === 'description') as FormDescription;
    desc.text = 'weird ]]> marker';
    const out = buildXML(form);
    const reparsed = parseXML(out);
    expect(reparsed).not.toBeNull();
    const desc2 = firstQuestion(reparsed as FormQuestionnaire).children
      .find(c => c.nodeType === 'description') as FormDescription;
    expect(desc2.text).toBe('weird ]]> marker');
  });

  test('literal placeholder tokens in user text survive the build untouched', () => {
    const form = load();
    const q = firstQuestion(form);
    const desc = q.children.find(c => c.nodeType === 'description') as FormDescription;
    desc.text = 'tokens __BOOL_TRUE__ and __FFRAW_0__ are just text';
    const out = buildXML(form);
    const desc2 = firstQuestion(parseXML(out) as FormQuestionnaire).children
      .find(c => c.nodeType === 'description') as FormDescription;
    expect(desc2.text).toBe('tokens __BOOL_TRUE__ and __FFRAW_0__ are just text');
  });
});
