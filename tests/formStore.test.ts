import { describe, test, expect, beforeEach } from 'vitest';
import type { FormQuestionnaire, FormConditionLogic, FormSubSection, FormSection, FormQuestion } from '@/types/form';

// The store persists via sessionStorage and copies via localStorage - stub both
const makeStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
};
(globalThis as unknown as Record<string, unknown>).sessionStorage = makeStorage();
(globalThis as unknown as Record<string, unknown>).localStorage = makeStorage();

const { useFormStore } = await import('@/stores/formStore');
const { parseXML } = await import('@/lib/xmlParser');

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="19" title="T" suffix="9" nextid="20" order="0">
    <section id="29" title="S">
        <subsection id="39" title="SS" depends="179" condition="true">
            <question id="149" type="radio" required="" format="" triggervalue="" comment="">
                <description id="159" prefix=""><![CDATA[Q]]></description>
                <option id="169" value="Yes"><![CDATA[Yes]]></option>
            </question>
            <conditionlogic id="179" operator="or">
                <condition id="189" value="Yes" questionid="149" equals="true"/>
            </conditionlogic>
        </subsection>
    </section>
</questionnaire>`;

const loadFixture = (): FormQuestionnaire => {
  const form = parseXML(FIXTURE);
  expect(form).not.toBeNull();
  return form as FormQuestionnaire;
};

const collectIds = (n: unknown, out: string[] = []): string[] => {
  const node = n as { id: string; children?: unknown[]; conditions?: unknown[] };
  out.push(node.id);
  (node.conditions || []).forEach(c => collectIds(c, out));
  (node.children || []).forEach(c => collectIds(c, out));
  return out;
};

describe('formStore ID management', () => {
  beforeEach(() => {
    useFormStore.setState({ form: null, selectedNodeId: null, history: [], historyIndex: -1 });
  });

  test('regenerateAllIds keeps condition.questionId pointing at the renamed question and produces no duplicates', () => {
    useFormStore.getState().setForm(loadFixture());
    useFormStore.getState().regenerateAllIds();

    const form = useFormStore.getState().form as FormQuestionnaire;
    const ids = collectIds(form);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids anywhere

    const section = form.children[0] as FormSection;
    const ss = section.children[0] as FormSubSection;
    const question = ss.children.find(c => c.nodeType === 'question') as FormQuestion;
    const cl = ss.children.find(c => c.nodeType === 'conditionlogic') as FormConditionLogic;

    expect(question.id).not.toBe('149');
    expect(cl.conditions[0].id).not.toBe('189'); // condition element got a fresh id too
    expect(cl.conditions[0].questionId).toBe(question.id); // reference follows the rename
    expect(ss.depends).toBe(cl.id); // subsection depends follows the rename
  });

  test('duplicateNode remaps internal condition references inside the clone', () => {
    useFormStore.getState().setForm(loadFixture());
    useFormStore.getState().duplicateNode('39'); // duplicate the subsection

    const form = useFormStore.getState().form as FormQuestionnaire;
    const section = form.children[0] as FormSection;
    expect(section.children).toHaveLength(2);

    const clone = section.children[1] as FormSubSection;
    const cloneQuestion = clone.children.find(c => c.nodeType === 'question') as FormQuestion;
    const cloneCl = clone.children.find(c => c.nodeType === 'conditionlogic') as FormConditionLogic;

    expect(cloneQuestion.id).not.toBe('149');
    expect(cloneCl.conditions[0].id).not.toBe('189');
    expect(cloneCl.conditions[0].questionId).toBe(cloneQuestion.id);
    expect(clone.depends).toBe(cloneCl.id);

    const ids = collectIds(form);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('generateId never collides with condition element ids', () => {
    const form = loadFixture();
    // force nextId low so the generator would walk over existing ids incl. 89
    form.nextId = 18;
    useFormStore.getState().setForm(form);

    const id1 = useFormStore.getState().generateId();
    expect(id1).not.toBe('189'); // 8+"9" = "89" is taken by the condition element
    const ids = new Set(collectIds(useFormStore.getState().form));
    expect(ids.has(id1)).toBe(false);
  });

  test('copyNode/canPaste/pasteNode work together through the store', () => {
    useFormStore.getState().setForm(loadFixture());
    useFormStore.getState().copyNode('149'); // copy the question

    expect(useFormStore.getState().canPaste('39')).toBe(true);
    useFormStore.getState().pasteNode('39');

    const form = useFormStore.getState().form as FormQuestionnaire;
    const ss = (form.children[0] as FormSection).children[0] as FormSubSection;
    const questions = ss.children.filter(c => c.nodeType === 'question');
    expect(questions).toHaveLength(2);
  });
});

describe('formStore nextId bookkeeping', () => {
  test('duplicateNode advances nextId past the freshly minted ids', () => {
    useFormStore.setState({ form: null, selectedNodeId: null, history: [], historyIndex: -1 });
    const form = parseXML(FIXTURE) as FormQuestionnaire;
    useFormStore.getState().setForm(form);
    useFormStore.getState().duplicateNode('39'); // subsection with 6 descendants

    const updated = useFormStore.getState().form as FormQuestionnaire;
    const maxNum = Math.max(
      ...collectIds(updated)
        .filter(id => id.endsWith(updated.suffix))
        .map(id => parseInt(id.slice(0, -updated.suffix.length), 10))
        .filter(n => !isNaN(n))
    );
    // before the fix, generateId's nextId bumps were clobbered by a stale clone
    expect(updated.nextId).toBeGreaterThan(maxNum);
  });
});
