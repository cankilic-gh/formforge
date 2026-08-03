import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { FormQuestionnaire, FormSection, FormSubSection, FormQuestion, FormDescription } from '@/types/form';
import { buildAnyXML } from '@/lib/xmlParser';

const makeStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
};
(globalThis as unknown as Record<string, unknown>).sessionStorage = makeStorage();
(globalThis as unknown as Record<string, unknown>).localStorage = makeStorage();

const { safeSetSessionStorageItem, useFormStore } = await import('@/stores/formStore');
const {
  isFormDirty,
  loadReloadForm,
  resolveSavedBaselineAfterReload,
  shouldContinueAfterSave,
} = await import('@/lib/reloadSource');

const FULL_TEXT = 'I confirm eligibility under C.R.C.P. 204.3. [stable reload baseline]';
const BASELINE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="100001" title="Reload Test" suffix="00001" nextid="6" order="0">
  <section id="200001" title="Section">
    <subsection id="300001" title="Subsection">
      <question id="400001" type="text" required="true" format="" triggervalue="" comment="">
        <description id="500001" prefix=""><![CDATA[${FULL_TEXT}]]></description>
      </question>
    </subsection>
  </section>
</questionnaire>`;

const descriptionText = (form: FormQuestionnaire): string => {
  const section = form.children[0] as FormSection;
  const subsection = section.children[0] as FormSubSection;
  const question = subsection.children[0] as FormQuestion;
  return (question.children[0] as FormDescription).text;
};

describe('reload source', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useFormStore.setState({
      form: null,
      reloadBaselineXml: null,
      selectedNodeId: null,
      history: [],
      historyIndex: -1,
      savedBaselineXml: null,
    });
  });

  test('loading a form replaces prior undo history with one clean snapshot', async () => {
    const baseline = await loadReloadForm(null, BASELINE_XML) as FormQuestionnaire;
    useFormStore.getState().setForm(baseline);

    for (let i = 1; i <= 60; i++) {
      useFormStore.getState().updateNode('500001', { text: `intermediate-${i}` });
    }

    useFormStore.getState().setForm(baseline);
    const state = useFormStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.historyIndex).toBe(0);
    expect(descriptionText(state.form as FormQuestionnaire)).toBe(FULL_TEXT);
  });

  test('dirty detection survives a bounded-history shift after save', async () => {
    const baseline = await loadReloadForm(null, BASELINE_XML) as FormQuestionnaire;
    useFormStore.getState().setForm(baseline);

    for (let i = 1; i <= 60; i++) {
      useFormStore.getState().updateNode('500001', { text: `edit-${i}` });
    }

    const savedXml = buildAnyXML(useFormStore.getState().form!);
    expect(isFormDirty(useFormStore.getState().form, savedXml)).toBe(false);
    expect(useFormStore.getState().historyIndex).toBe(49);

    useFormStore.getState().updateNode('500001', { text: 'edit-after-save' });
    expect(useFormStore.getState().historyIndex).toBe(49);
    expect(isFormDirty(useFormStore.getState().form, savedXml)).toBe(true);
  });

  test('reload keeps a never-saved form dirty without a real file handle', () => {
    expect(isFormDirty({} as FormQuestionnaire, null)).toBe(true);
    expect(resolveSavedBaselineAfterReload(null, false, '<reloaded/>')).toBeNull();
    expect(resolveSavedBaselineAfterReload(null, true, '<reloaded/>')).toBe('<reloaded/>');
    expect(resolveSavedBaselineAfterReload('<saved/>', false, '<reloaded/>')).toBe('<reloaded/>');
  });

  test('a non-toolbar loader persists the reload baseline for session restoration', async () => {
    const store = useFormStore.getState() as typeof useFormStore extends { getState: () => infer S }
      ? S & { setReloadBaselineXml: (xml: string) => void; reloadBaselineXml: string | null }
      : never;

    store.setReloadBaselineXml(BASELINE_XML);
    const persisted = JSON.parse(sessionStorage.getItem('formforge-storage') ?? '{}');
    expect(persisted.state.reloadBaselineXml).toBe(BASELINE_XML);

    const reloaded = await loadReloadForm(
      null,
      (useFormStore.getState() as typeof store).reloadBaselineXml
    ) as FormQuestionnaire;
    expect(descriptionText(reloaded)).toBe(FULL_TEXT);
  });

  test('session restoration reseeds history and marks the restored form clean', async () => {
    const baseline = await loadReloadForm(null, BASELINE_XML) as FormQuestionnaire;
    const canonicalBaseline = buildAnyXML(baseline);
    const store = useFormStore.getState() as typeof useFormStore extends { getState: () => infer S }
      ? S & { setSavedBaselineXml: (xml: string | null) => void; savedBaselineXml: string | null }
      : never;

    useFormStore.getState().setForm(baseline);
    useFormStore.getState().setReloadBaselineXml(canonicalBaseline);
    store.setSavedBaselineXml(canonicalBaseline);

    const persistedSession = sessionStorage.getItem('formforge-storage');
    expect(persistedSession).not.toBeNull();
    useFormStore.setState({ form: null, history: [], historyIndex: -1, savedBaselineXml: null });
    sessionStorage.setItem('formforge-storage', persistedSession as string);
    await useFormStore.persist.rehydrate();

    const restored = useFormStore.getState() as typeof store;
    expect(restored.form).not.toBeNull();
    expect(restored.history).toHaveLength(1);
    expect(restored.historyIndex).toBe(0);
    expect(isFormDirty(restored.form, restored.savedBaselineXml)).toBe(false);
  });

  test('session restoration preserves dirty state when form differs from saved baseline', async () => {
    const baseline = await loadReloadForm(null, BASELINE_XML) as FormQuestionnaire;
    const canonicalBaseline = buildAnyXML(baseline);
    const store = useFormStore.getState() as typeof useFormStore extends { getState: () => infer S }
      ? S & { setSavedBaselineXml: (xml: string | null) => void; savedBaselineXml: string | null }
      : never;

    useFormStore.getState().setForm(baseline);
    useFormStore.getState().setReloadBaselineXml(canonicalBaseline);
    store.setSavedBaselineXml(canonicalBaseline);
    useFormStore.getState().updateNode('500001', { text: 'unsaved edit restored after refresh' });

    const persistedSession = sessionStorage.getItem('formforge-storage');
    expect(persistedSession).not.toBeNull();
    useFormStore.setState({ form: null, history: [], historyIndex: -1, savedBaselineXml: null });
    sessionStorage.setItem('formforge-storage', persistedSession as string);
    await useFormStore.persist.rehydrate();

    const restored = useFormStore.getState() as typeof store;
    expect(descriptionText(restored.form as FormQuestionnaire)).toBe('unsaved edit restored after refresh');
    expect(restored.historyIndex).toBe(0);
    expect(isFormDirty(restored.form, restored.savedBaselineXml)).toBe(true);
  });

  test('legacy session restoration synthesizes a reload source but remains dirty', async () => {
    const baseline = await loadReloadForm(null, BASELINE_XML) as FormQuestionnaire;
    sessionStorage.setItem('formforge-storage', JSON.stringify({
      state: { form: baseline, expandedNodes: [] },
      version: 0,
    }));

    await useFormStore.persist.rehydrate();

    const restored = useFormStore.getState();
    expect(restored.reloadBaselineXml).toBe(buildAnyXML(baseline));
    expect(restored.savedBaselineXml).toBeNull();
    expect(isFormDirty(restored.form, restored.savedBaselineXml)).toBe(true);
  });

  test('a destructive action stops when the requested save is cancelled', async () => {
    expect(await shouldContinueAfterSave(true, async () => false)).toBe(false);
    expect(await shouldContinueAfterSave(true, async () => true)).toBe(true);
  });

  test('a destructive action can continue without saving when discard is chosen', async () => {
    let saveCalled = false;
    const result = await shouldContinueAfterSave(false, async () => {
      saveCalled = true;
      return true;
    });

    expect(result).toBe(true);
    expect(saveCalled).toBe(false);
  });

  test('session persistence failure is best-effort and does not throw into editor actions', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const storage = {
      setItem: () => { throw new DOMException('quota exceeded', 'QuotaExceededError'); },
    };

    expect(() => safeSetSessionStorageItem(storage, 'formforge-storage', { state: {} })).not.toThrow();
    expect(safeSetSessionStorageItem(storage, 'formforge-storage', { state: {} })).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('fallback reload uses the stable XML baseline after more than 50 edit snapshots', async () => {
    const initial = await loadReloadForm(null, BASELINE_XML) as FormQuestionnaire;
    useFormStore.getState().setForm(initial);

    for (let i = 1; i <= 60; i++) {
      useFormStore.getState().updateNode('500001', { text: `partial-${i}` });
    }

    expect(useFormStore.getState().history).toHaveLength(50);
    const oldestRetained = useFormStore.getState().history[0] as FormQuestionnaire;
    expect(descriptionText(oldestRetained)).not.toBe(FULL_TEXT);

    const reloaded = await loadReloadForm(null, BASELINE_XML) as FormQuestionnaire;
    expect(descriptionText(reloaded)).toBe(FULL_TEXT);
  });

  test('file-handle reload reads the current file instead of a stale fallback baseline', async () => {
    const diskText = FULL_TEXT.replace('stable reload baseline', 'current disk contents');
    const diskXml = BASELINE_XML.replace(FULL_TEXT, diskText);
    const handle = {
      getFile: async () => ({ text: async () => diskXml }),
    };

    const reloaded = await loadReloadForm(handle, BASELINE_XML) as FormQuestionnaire;
    expect(descriptionText(reloaded)).toBe(diskText);
  });

  test('reload rejects unreadable and invalid sources so the caller can preserve current state', async () => {
    const unreadable = { getFile: async () => { throw new Error('read failed'); } };
    await expect(loadReloadForm(unreadable, BASELINE_XML)).rejects.toThrow('read failed');
    await expect(loadReloadForm(null, '<not-a-form/>')).rejects.toThrow('Failed to parse reload XML');
  });
});
