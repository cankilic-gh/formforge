import { describe, test, expect } from 'vitest';
import { parseXML, buildXML } from '@/lib/xmlParser';
import { FormQuestionnaire, FormSubSection, FormEntity } from '@/types/form';

const wrap = (subsectionContent: string, qAttrs = ''): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="1999" title="T" suffix="999" nextid="50" order="0" ${qAttrs}>
    <section id="2999" title="S">
        <subsection id="3999" title="SS">
${subsectionContent}
        </subsection>
    </section>
</questionnaire>`;

const roundTrip = (xml: string): string => {
  const form = parseXML(xml);
  expect(form).not.toBeNull();
  return buildXML(form as FormQuestionnaire);
};

const firstSubsection = (form: FormQuestionnaire): FormSubSection => {
  const section = form.children[0] as { children: FormSubSection[] };
  return section.children[0];
};

describe('P0 element coverage', () => {
  test('simpletext survives round-trip with its text', () => {
    const xml = wrap(`<simpletext id="4999" prefix=""><![CDATA[<h5>Raw block</h5>]]></simpletext>`);
    const out = roundTrip(xml);
    expect(out).toContain('<simpletext');
    expect(out).toContain('id="4999"');
    expect(out).toContain('<h5>Raw block</h5>');
  });

  test('simpletext is exposed as a model node, not dropped', () => {
    const xml = wrap(`<simpletext id="4999" prefix="x"><![CDATA[hello]]></simpletext>`);
    const form = parseXML(xml)!;
    const ss = firstSubsection(form);
    expect(ss.children).toHaveLength(1);
    expect(ss.children[0].nodeType).toBe('simpletext');
  });

  test('validator element survives round-trip with validatorclass', () => {
    const xml = wrap(`<question id="4999" type="char" required="" format="" triggervalue="" comment=""><description id="5999" prefix="1."><![CDATA[Q]]></description></question>
<validator id="6999" validatorclass="ilg.ebar.forms.validators.EmpDateGapValidator"/>`);
    const out = roundTrip(xml);
    expect(out).toContain('<validator');
    expect(out).toContain('validatorclass="ilg.ebar.forms.validators.EmpDateGapValidator"');
  });

  test('unknown elements are preserved verbatim, not dropped', () => {
    const xml = wrap(`<previousanswer id="7999" revision="2"><![CDATA[old answer]]></previousanswer>`);
    const out = roundTrip(xml);
    expect(out).toContain('<previousanswer');
    expect(out).toContain('revision="2"');
    expect(out).toContain('old answer');
  });

  test('answer element survives round-trip', () => {
    const xml = wrap(`<question id="4999" type="char" required="" format="" triggervalue="" comment=""><description id="5999" prefix=""><![CDATA[Q]]></description><answer id="8999"><![CDATA[my answer]]></answer></question>`);
    const out = roundTrip(xml);
    expect(out).toContain('<answer');
    expect(out).toContain('my answer');
  });

  test('questionnaire-level non-section children are preserved', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="1999" title="T" suffix="999" nextid="50" order="0">
    <includeform id="9999" type="online" formname="character-witness" title="CW" multipleinclude="true" required="false" showinbaradmin="true" order="0" nextorder="1"/>
    <section id="2999" title="S">
        <subsection id="3999" title="SS"></subsection>
    </section>
</questionnaire>`;
    const out = roundTrip(xml);
    expect(out).toContain('<includeform');
    expect(out).toContain('formname="character-witness"');
    // order must be preserved: includeform BEFORE section
    expect(out.indexOf('<includeform')).toBeLessThan(out.indexOf('<section'));
  });

  test('section-level non-subsection children are preserved', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="1999" title="T" suffix="999" nextid="50" order="0">
    <section id="2999" title="S">
        <note id="4999" ischeckitem="false"><![CDATA[section level note]]></note>
        <subsection id="3999" title="SS"></subsection>
    </section>
</questionnaire>`;
    const out = roundTrip(xml);
    expect(out).toContain('section level note');
  });
});

describe('question children stay modeled (not unknown)', () => {
  test('options with CDATA on their own line parse as option nodes', () => {
    const xml = wrap(`<question id="4999" type="radio" required="" format="" triggervalue="" comment="">
                <description id="5999" prefix=""><![CDATA[Q]]></description>
                <option id="6999" value="yes">
                    <![CDATA[Yes]]>
                </option>
                <option id="7999" value="no">
                    <![CDATA[No]]>
                </option>
            </question>`);
    const form = parseXML(xml)!;
    const ss = firstSubsection(form);
    const q = ss.children[0] as { children: { nodeType: string; text?: string; value?: string }[] };
    const options = q.children.filter(c => c.nodeType === 'option');
    expect(options).toHaveLength(2);
    expect(options[0].text).toBe('Yes');
    expect(options[0].value).toBe('yes');
    const unknowns = q.children.filter(c => c.nodeType === 'unknown');
    expect(unknowns).toHaveLength(0);
  });

  test('references inside conditionset questions parse as reference nodes', () => {
    const xml = wrap(`<conditionset id="4999" operator="and">
                <question id="5999" type="profilereference" required="" format="" triggervalue="" comment="">
                    <reference id="6999" table="" field="fullname"></reference>
                </question>
            </conditionset>`);
    const form = parseXML(xml)!;
    const ss = firstSubsection(form);
    const cs = ss.children[0] as { children: { nodeType: string; children?: { nodeType: string }[] }[] };
    const q = cs.children.find(c => c.nodeType === 'question')!;
    expect(q.children!.some(c => c.nodeType === 'reference')).toBe(true);
    expect(q.children!.some(c => c.nodeType === 'unknown')).toBe(false);
  });
});

describe('P0 round-trip fidelity', () => {
  test('raw (non-CDATA) HTML inside description is preserved', () => {
    const xml = wrap(`<description id="4999" prefix="">Hello <strong>world</strong> and <a href="x">link</a></description>`);
    const out = roundTrip(xml);
    expect(out).toContain('Hello');
    expect(out).toContain('<strong>world</strong>');
    expect(out).toContain('<a href="x">link</a>');
    // the space between text runs must not collapse
    expect(out).not.toContain('Helloand');
  });

  test('entity order and nextorder are serialized', () => {
    const xml = wrap(`<entity id="4999" type="addmore" title="Emp" min="1" max="0" order="0" nextorder="3" grouptype="" showinbaradmin="true"></entity>`);
    const out = roundTrip(xml);
    expect(out).toMatch(/<entity[^>]*order="0"/);
    expect(out).toMatch(/<entity[^>]*nextorder="3"/);
  });

  test('newly toggled showinbaradmin on entity is serialized', () => {
    const xml = wrap(`<entity id="4999" type="single" title="E" min="0" max="0" order="0" nextorder="1"></entity>`);
    const form = parseXML(xml)!;
    const ss = firstSubsection(form);
    const entity = ss.children[0] as FormEntity;
    entity.showInBarAdmin = false;
    const out = buildXML(form);
    expect(out).toMatch(/<entity[^>]*showinbaradmin="false"/);
  });

  test('empty attributes are preserved on round-trip', () => {
    const xml = wrap(`<question id="4999" type="char" required="" format="" triggervalue="" comment="" ncbe_name="" refname=""><description id="5999" prefix=""><![CDATA[Q]]></description></question>`);
    const out = roundTrip(xml);
    expect(out).toContain('ncbe_name=""');
    expect(out).toContain('refname=""');
  });

  test('subform order attribute of a nested subform under includeform is not touched', () => {
    // questionnaire-level: rely on _originalAttrs passthrough for unmodeled attrs
    const xml = wrap(`<question id="4999" type="char" required="" format="" triggervalue="" comment="" xeditorlocknodeid="abc"><description id="5999" prefix=""><![CDATA[Q]]></description></question>`);
    const out = roundTrip(xml);
    expect(out).toContain('xeditorlocknodeid="abc"');
  });

  test('note prefix and warning preventsubmit survive round-trip', () => {
    const xml = wrap(`<note id="4999" ischeckitem="true" prefix="NOTE:"><![CDATA[check me]]></note>
<warning id="5999" preventsubmit="true"><![CDATA[stop]]></warning>`);
    const out = roundTrip(xml);
    expect(out).toContain('prefix="NOTE:"');
    expect(out).toContain('preventsubmit="true"');
  });

  test('subsection depends/condition survive round-trip', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="1999" title="T" suffix="999" nextid="50" order="0">
    <section id="2999" title="S">
        <subsection id="3999" title="SS" depends="4999" condition="true"></subsection>
    </section>
</questionnaire>`;
    const out = roundTrip(xml);
    expect(out).toContain('depends="4999"');
    expect(out).toContain('condition="true"');
  });
});
