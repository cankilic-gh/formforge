import { describe, test, expect } from 'vitest';
import { parseXML, parseAnyXML } from '@/lib/xmlParser';
import { validateForm } from '@/lib/validation';
import type { FormQuestionnaire } from '@/types/form';

const hasError = (xmlContent: string, needle: string, attrs = ''): boolean => {
  const form = makeForm(xmlContent, attrs);
  return validateForm(form).some((e) => e.type === 'error' && e.message.includes(needle));
};
const hasWarning = (xmlContent: string, needle: string, attrs = ''): boolean => {
  const form = makeForm(xmlContent, attrs);
  return validateForm(form).some((e) => e.type === 'warning' && e.message.includes(needle));
};

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

  test('does NOT warn about a missing description on a profilereference (label comes from adjacent text)', () => {
    const form = makeForm(`<simpletext id="48"><![CDATA[<strong>Full Name:</strong>]]></simpletext>
      <question id="49" type="profilereference" format="simple" required="" triggervalue="" comment="">
        <reference id="59" table="profile" field="fullname"/>
      </question>`);
    const warnings = validateForm(form).filter(e => e.message.includes('no description child'));
    expect(warnings).toHaveLength(0);
  });
});

describe('required-attribute (engine crash) checks', () => {
  test('flags an <option> with no value attribute', () => {
    expect(hasError(
      `<question id="49" type="radio" format="" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[Q]]></description>
         <option id="69"><![CDATA[Yes]]></option>
       </question>`, 'missing required attribute "value"')).toBe(true);
  });

  test('flags a <conditionset> with no operator', () => {
    expect(hasError(
      `<conditionset id="79">
         <question id="49" type="radio" format="" required="" triggervalue="yes" comment="">
           <description id="59"><![CDATA[Q]]></description>
           <option id="69" value="yes"><![CDATA[Yes]]></option>
         </question>
       </conditionset>`, 'missing required attribute "operator"')).toBe(true);
  });

  test('flags a <reference> missing table/field', () => {
    expect(hasError(
      `<question id="49" type="profilereference" format="" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[Q]]></description>
         <reference id="69"/>
       </question>`, 'missing required attribute "table"')).toBe(true);
  });

  test('flags an add-more <entity> missing min/max', () => {
    expect(hasError(
      `<entity id="99" type="addmore" title="E" order="0" nextorder="1"></entity>`,
      'missing required attribute "min"')).toBe(true);
  });

  test('flags a non-numeric id', () => {
    expect(hasError(
      `<question id="abc" type="char" format="" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[Q]]></description>
       </question>`, 'not a whole number')).toBe(true);
  });
});

describe('question type checks', () => {
  test('flags an unknown question type as an invisible-render error', () => {
    expect(hasError(
      `<question id="49" type="dropdownlist" format="" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[Q]]></description>
       </question>`, 'unknown type="dropdownlist"')).toBe(true);
  });

  test('flags uppercase TEXT (text is case-sensitive)', () => {
    expect(hasError(
      `<question id="49" type="TEXT" format="" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[Q]]></description>
       </question>`, 'case-sensitively')).toBe(true);
  });

  test('accepts a valid lowercase type', () => {
    const form = makeForm(
      `<question id="49" type="char" format="" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[Q]]></description>
       </question>`);
    expect(validateForm(form).filter(e => e.type === 'error')).toHaveLength(0);
  });
});

describe('date format checks', () => {
  test('warns on an unrecognized date format', () => {
    expect(hasWarning(
      `<question id="49" type="date" format="mm/dd//yy" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[Q]]></description>
       </question>`, 'silently falls back')).toBe(true);
  });

  test('does not warn on mm/dd/yy or mm/yy', () => {
    for (const fmt of ['mm/dd/yy', 'mm/yy', 'present_mm/yy']) {
      expect(hasWarning(
        `<question id="49" type="date" format="${fmt}" required="" triggervalue="" comment="">
           <description id="59"><![CDATA[Q]]></description>
         </question>`, 'silently falls back')).toBe(false);
    }
  });
});

describe('option & radioseperate checks', () => {
  test('warns when a radioseperate option/segment count mismatches', () => {
    expect(hasWarning(
      `<question id="49" type="radioseperate" format="" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[I am a <----> of the <----> bar]]></description>
         <option id="69" value="a"><![CDATA[member]]></option>
         <option id="79" value="b"><![CDATA[nonmember]]></option>
       </question>`, 'text segment')).toBe(true);
  });

  test('warns when a radio has no options', () => {
    expect(hasWarning(
      `<question id="49" type="radio" format="" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[Q]]></description>
       </question>`, 'no <option> children')).toBe(true);
  });
});

describe('reference & validator checks', () => {
  test('warns on an unknown profile reference field', () => {
    expect(hasWarning(
      `<question id="49" type="profilereference" format="" required="" triggervalue="" comment="">
         <description id="59"><![CDATA[Q]]></description>
         <reference id="69" table="profile" field="favorite_color"/>
       </question>`, 'not in the known profile-field list')).toBe(true);
  });

  test('warns on an unknown validator class but not a known one', () => {
    expect(hasWarning(
      `<question id="49" type="char" format="" required="" triggervalue="" comment="" validatorclass="ilg.ebar.forms.validators.FooValidator">
         <description id="59"><![CDATA[Q]]></description>
       </question>`, 'not a known E-Bar validator')).toBe(true);

    expect(hasWarning(
      `<question id="49" type="char" format="" required="" triggervalue="" comment="" validatorclass="ilg.ebar.forms.validators.EmailValidator">
         <description id="59"><![CDATA[Q]]></description>
       </question>`, 'not a known E-Bar validator')).toBe(false);
  });
});

describe('conditionlogic placement', () => {
  test('flags a conditionlogic with no subsection/entity ancestor', () => {
    // subform root -> conditionlogic directly under it (no subsection/entity)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<subform id="19" title="T" suffix="9" nextid="30">
  <conditionlogic id="79" operator="or">
    <condition id="89" value="Yes" questionid="49" equals="true"/>
  </conditionlogic>
  <question id="49" type="radio" format="" required="" triggervalue="" comment="">
    <description id="59"><![CDATA[Q]]></description>
    <option id="69" value="Yes"><![CDATA[Yes]]></option>
  </question>
</subform>`;
    const form = parseAnyXML(xml);
    expect(form).not.toBeNull();
    const errors = validateForm(form);
    expect(errors.some(e => e.type === 'error' && e.message.includes('not inside a subsection or entity'))).toBe(true);
  });

  test('does not flag a conditionlogic inside a subsection', () => {
    const form = makeForm(`<conditionlogic id="79" operator="or">
      <condition id="89" value="Yes" questionid="49" equals="true"/>
    </conditionlogic>
    <question id="49" type="radio" format="" required="" triggervalue="" comment="">
      <description id="59"><![CDATA[Q]]></description>
      <option id="69" value="Yes"><![CDATA[Yes]]></option>
    </question>`);
    expect(validateForm(form).some(e => e.message.includes('not inside a subsection'))).toBe(false);
  });
});
