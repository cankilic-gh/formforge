import { describe, test, expect } from 'vitest';
import { parseXML } from '@/lib/xmlParser';
import { validateForm } from '@/lib/validation';
import type { FormQuestionnaire } from '@/types/form';

const makeForm = (subsectionContent: string, subsectionAttrs = ''): FormQuestionnaire => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="19" title="T" suffix="9" nextid="20" order="0">
    <section id="29" title="S">
        <subsection id="39" title="SS" ${subsectionAttrs}>
${subsectionContent}
        </subsection>
    </section>
</questionnaire>`;
  const form = parseXML(xml);
  expect(form).not.toBeNull();
  return form as FormQuestionnaire;
};

describe('reference integrity validation', () => {
  test('flags condition.questionid pointing at a missing question', () => {
    const form = makeForm(`<conditionlogic id="79" operator="or">
      <condition id="89" value="Yes" questionid="49999" equals="true"/>
    </conditionlogic>`);
    const errors = validateForm(form);
    expect(errors.some(e => e.type === 'error' && e.message.includes('49999'))).toBe(true);
  });

  test('accepts condition.questionid pointing at an existing question', () => {
    const form = makeForm(`<question id="49" type="radio" required="" format="" triggervalue="" comment="">
        <description id="59" prefix=""><![CDATA[Q]]></description>
        <option id="69" value="Yes"><![CDATA[Yes]]></option>
      </question>
      <conditionlogic id="79" operator="or">
        <condition id="89" value="Yes" questionid="49" equals="true"/>
      </conditionlogic>`);
    const errors = validateForm(form).filter(e => e.type === 'error');
    expect(errors).toHaveLength(0);
  });

  test('flags subsection depends pointing at a missing conditionset/conditionlogic', () => {
    const form = makeForm('', 'depends="66666" condition="true"');
    const errors = validateForm(form);
    expect(errors.some(e => e.type === 'error' && e.message.includes('66666'))).toBe(true);
  });

  test('flags duplicate ids including condition element ids', () => {
    const form = makeForm(`<question id="49" type="radio" required="" format="" triggervalue="" comment="">
        <description id="59" prefix=""><![CDATA[Q]]></description>
        <option id="69" value="Yes"><![CDATA[Yes]]></option>
      </question>
      <conditionlogic id="79" operator="or">
        <condition id="49" value="Yes" questionid="49" equals="true"/>
      </conditionlogic>`);
    const errors = validateForm(form);
    expect(errors.some(e => e.type === 'error' && e.message.toLowerCase().includes('duplicate'))).toBe(true);
  });

  test('warns when a question has no description child', () => {
    const form = makeForm(`<question id="49" type="char" required="" format="" triggervalue="" comment=""></question>`);
    const errors = validateForm(form);
    expect(errors.some(e => e.type === 'warning' && e.message.includes('description'))).toBe(true);
  });
});
