import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import type { FormQuestionnaire } from '@/types/form';

// The store persists via sessionStorage and copies via localStorage - stub both,
// same pattern as tests/formStore.test.ts, so useFormStore can run under vitest's
// node environment.
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
const { parseAnyXML, buildAnyXML } = await import('@/lib/xmlParser');

// Real, immutable E-Bar corpus. This form was picked because it is a small,
// CRLF + tab-indented questionnaire with no existing <required-doc> children,
// which makes "exactly one attribute changed + one line added" easy to prove
// with a raw text diff. Override with EBAR_STATES_DIR if the corpus
// lives elsewhere on a given machine; the test skips cleanly when absent.
const STATES_DIR = process.env.EBAR_STATES_DIR || '/Users/cankilic/Desktop/XML-FORMS/states';
const SOURCE_XML_PATH = path.join(STATES_DIR, 'ga', 'xml', 'forms', 'continuing-application.xml');
const corpusAvailable = fs.existsSync(SOURCE_XML_PATH);

const CF_XML_PATH = path.join(STATES_DIR, 'ga', 'xml', 'forms', 'characterandfitness.xml');
const cfCorpusAvailable = fs.existsSync(CF_XML_PATH);

const sha256 = (p: string): string => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git = (args: string[], cwd: string): string =>
  execFileSync('git', args, { cwd, encoding: 'utf-8' });

const collectIds = (node: unknown, out: string[] = []): string[] => {
  const n = node as { id?: string; children?: unknown[] };
  if (n.id) out.push(n.id);
  (n.children || []).forEach(c => collectIds(c, out));
  return out;
};

// Runs the real Open -> addRequiredDoc -> Save path against a real corpus file
// inside a throwaway sandbox git repo, and returns the raw diff plus the
// artifacts needed to assert on it. Never touches the source file.
//
// The three phases a byte can change in are measured SEPARATELY so a failure
// points at the culprit instead of the end result:
//   Open     - parse + build with no edit at all (`noopDiff` must be empty)
//   Mutation - the store action alone (must not touch the file or the in-memory
//              source string; `bytesOnDiskAfterMutation` / `originalXml`)
//   Save     - build of the mutated model (`diff`)
const runAddRequiredDocScenario = (sourceXmlPath: string, fileName: string, parentId: string, title: string) => {
  const sourceHashBefore = sha256(sourceXmlPath);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'formforge-required-doc-'));
  const sandboxXmlPath = path.join(sandbox, fileName);
  try {
    fs.copyFileSync(sourceXmlPath, sandboxXmlPath);

    git(['init', '-q'], sandbox);
    git(['-c', 'user.name=FormForge Test', '-c', 'user.email=test@formforge.local', 'add', '.'], sandbox);
    git(['-c', 'user.name=FormForge Test', '-c', 'user.email=test@formforge.local', 'commit', '-q', '-m', 'baseline'], sandbox);

    // Open: parse the sandbox copy exactly like the app would on file load.
    const originalXml = fs.readFileSync(sandboxXmlPath, 'utf-8');

    // --- Phase attribution 1/3: Open. Parse + build with NO edit whatsoever and
    // write it back. Any diff here is a pure round-trip (formatting) defect and
    // has nothing to do with adding a required doc.
    const noopForm = parseAnyXML(originalXml);
    if (!noopForm) throw new Error('no-op parse returned null');
    const noopXml = buildAnyXML(noopForm);
    fs.writeFileSync(sandboxXmlPath, noopXml, 'utf-8');
    const noopDiff = git(['diff', '--no-color', '--', fileName], sandbox);
    // restore the pristine baseline before the real scenario runs
    git(['checkout', '--', fileName], sandbox);

    const form = parseAnyXML(originalXml);
    if (!form || form.nodeType !== 'questionnaire') {
      throw new Error(`expected a questionnaire, got ${form?.nodeType ?? 'null'}`);
    }
    const questionnaire = form as FormQuestionnaire;

    // --- Phase attribution 2/3: Mutation. Add Required Doc via the same
    // production store action the UI's Sidebar "Add Required Document" button
    // calls (Sidebar.tsx -> addRequiredDoc). Nothing may be written yet.
    useFormStore.getState().setForm(questionnaire);
    useFormStore.getState().addRequiredDoc(parentId, title);
    const updatedForm = useFormStore.getState().form as FormQuestionnaire;
    const bytesOnDiskAfterMutation = fs.readFileSync(sandboxXmlPath, 'utf-8');

    // --- Phase attribution 3/3: Save. Serialize through the same
    // buildAnyXML/buildXML path used on save.
    const savedXml = buildAnyXML(updatedForm);
    fs.writeFileSync(sandboxXmlPath, savedXml, 'utf-8');

    // Inspect the raw git diff - this is the actual artifact under test.
    const diff = git(['diff', '--no-color', '--', fileName], sandbox);
    const addedLines = diff.split(/\r?\n/).filter(l => l.startsWith('+') && !l.startsWith('+++'));
    const removedLines = diff.split(/\r?\n/).filter(l => l.startsWith('-') && !l.startsWith('---'));

    const reparsed = parseAnyXML(savedXml);
    if (!reparsed || reparsed.nodeType !== 'questionnaire') {
      throw new Error(`rebuilt XML failed to re-parse as a questionnaire`);
    }

    return {
      originalXml,
      bytesOnDiskAfterMutation,
      noopXml,
      noopDiff,
      nextIdBefore: questionnaire.nextId,
      diff,
      addedLines,
      removedLines,
      savedXml,
      reparsedQuestionnaire: reparsed as FormQuestionnaire,
      sourceHashAfter: sha256(sourceXmlPath),
      sourceHashBefore,
    };
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
};

describe.skipIf(!corpusAvailable)('Required Doc regression against real GA corpus form', () => {
  beforeEach(() => {
    useFormStore.setState({ form: null, selectedNodeId: null, history: [], historyIndex: -1 });
  });

  test('Open XML -> addRequiredDoc -> Save changes only nextid + one inserted <required-doc>', () => {
    const originalXmlOnDisk = fs.readFileSync(SOURCE_XML_PATH, 'utf-8');
    expect(originalXmlOnDisk).not.toMatch(/required-doc/); // fixture assumption: no pre-existing required docs
    expect(originalXmlOnDisk).toMatch(/\r\n/); // fixture assumption: CRLF source
    expect(originalXmlOnDisk).toMatch(/\r\n\t<section/); // fixture assumption: tab-indented source

    // The only subsection in this form - real parent a user would target from the UI.
    const result = runAddRequiredDocScenario(SOURCE_XML_PATH, 'continuing-application.xml', '303010', 'Proof of Identity');

    // Open alone must be byte-neutral: parse + build with no edit changes nothing.
    expect(result.noopDiff).toBe('');
    // The mutation alone must not write anything to disk.
    expect(result.bytesOnDiskAfterMutation).toBe(result.originalXml);

    expect(result.nextIdBefore).toBe(8);

    // Exactly one line removed (the old root open tag) and two added (the new
    // root open tag with bumped nextid, and the new required-doc line).
    expect(result.removedLines).toHaveLength(1);
    expect(result.addedLines).toHaveLength(2);

    expect(result.removedLines[0]).toBe('-<questionnaire id="103010" nextid="8" suffix="03010" order="0" title="Continuing Application">');
    const newRootLine = result.addedLines.find(l => l.includes('<questionnaire'));
    const newDocLine = result.addedLines.find(l => l.includes('<required-doc'));
    expect(newRootLine).toBe('+<questionnaire id="103010" nextid="9" suffix="03010" order="0" title="Continuing Application">');
    expect(newDocLine).toBe('+\t\t\t<required-doc id="803010" title="Proof of Identity" preventsubmit="true"></required-doc>');

    // No other bytes may move: strip the two known-changed lines and diff the rest.
    expect(result.removedLines.filter(l => l !== result.removedLines[0])).toHaveLength(0);
    expect(result.addedLines.filter(l => l !== newRootLine && l !== newDocLine)).toHaveLength(0);

    // Encoding declaration, CRLF, and trailing newline must all survive untouched.
    expect(result.savedXml.startsWith('<?xml version="1.0" encoding="utf-8"?>\r\n')).toBe(true);
    expect(result.savedXml.endsWith('</questionnaire>\r\n')).toBe(true);
    expect(result.savedXml).not.toMatch(/[^\r]\n/); // every \n is preceded by \r (pure CRLF, no bare \n)

    // Reparse, and validate ID integrity.
    const ids = collectIds(result.reparsedQuestionnaire);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids anywhere
    expect(ids).toContain('803010');

    // nextid must be greater than the numeric prefix of every generated id,
    // so the next save never collides with an id already in the tree.
    expect(result.reparsedQuestionnaire.nextId).toBe(9);
    expect(result.reparsedQuestionnaire.nextId).toBeGreaterThan(8); // > the prefix used for the new id ("8" + suffix)

    // Second-save stability: rebuilding the reparsed form is byte-identical (idempotent).
    expect(buildAnyXML(result.reparsedQuestionnaire)).toBe(result.savedXml);

    // The real corpus file must never have been touched.
    expect(result.sourceHashAfter).toBe(result.sourceHashBefore);
  });

  test.skipIf(!cfCorpusAvailable)('Open Character and Fitness XML -> addRequiredDoc -> Save changes only nextid + one inserted <required-doc>', () => {
    const originalXmlOnDisk = fs.readFileSync(CF_XML_PATH, 'utf-8');
    expect(originalXmlOnDisk).not.toMatch(/required-doc/); // fixture assumption: no pre-existing required docs
    expect(originalXmlOnDisk).toMatch(/\r\n/); // fixture assumption: CRLF source

    // "Personal References" - the last subsection in the form, a real parent
    // a user would target from the UI's tree.
    const result = runAddRequiredDocScenario(CF_XML_PATH, 'characterandfitness.xml', '148203001', 'Proof of Bar Admission Elsewhere');

    expect(result.noopDiff).toBe('');
    expect(result.bytesOnDiskAfterMutation).toBe(result.originalXml);

    expect(result.nextIdBefore).toBe(1853);

    // Exactly one line removed (the old root open tag) and two added (the new
    // root open tag with bumped nextid, and the new required-doc line).
    expect(result.removedLines).toHaveLength(1);
    expect(result.addedLines).toHaveLength(2);

    expect(result.removedLines[0]).toBe('-<questionnaire id="103001" nextid="1853" suffix="03001" order="0" title="Character And Fitness Questionnaire">');
    const newRootLine = result.addedLines.find(l => l.includes('<questionnaire'));
    const newDocLine = result.addedLines.find(l => l.includes('<required-doc'));
    expect(newRootLine).toBe('+<questionnaire id="103001" nextid="1854" suffix="03001" order="0" title="Character And Fitness Questionnaire">');
    expect(newDocLine).toBe('+            <required-doc id="185303001" title="Proof of Bar Admission Elsewhere" preventsubmit="true"></required-doc>');

    // No other bytes may move: strip the two known-changed lines and diff the rest.
    expect(result.removedLines.filter(l => l !== result.removedLines[0])).toHaveLength(0);
    expect(result.addedLines.filter(l => l !== newRootLine && l !== newDocLine)).toHaveLength(0);

    // Encoding declaration, CRLF, and (lack of) trailing newline must all survive
    // untouched (this fixture uses "UTF-8" uppercase, space indentation, and no
    // final newline after </questionnaire> - unlike the GA continuing-application
    // fixture above, so the assertions follow this file's own convention).
    expect(result.savedXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\r\n')).toBe(true);
    expect(result.savedXml.endsWith('</questionnaire>')).toBe(true);
    expect(result.savedXml.endsWith('</questionnaire>\r\n')).toBe(false);
    expect(result.savedXml).not.toMatch(/[^\r]\n/); // every \n is preceded by \r (pure CRLF, no bare \n)

    // Reparse, and validate ID integrity.
    const ids = collectIds(result.reparsedQuestionnaire);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids anywhere
    expect(ids).toContain('185303001');

    // nextid must be greater than the numeric prefix of every generated id,
    // so the next save never collides with an id already in the tree.
    expect(result.reparsedQuestionnaire.nextId).toBe(1854);
    expect(result.reparsedQuestionnaire.nextId).toBeGreaterThan(1853); // > the prefix used for the new id ("1853" + suffix)

    // Second-save stability: rebuilding the reparsed form is byte-identical (idempotent).
    expect(buildAnyXML(result.reparsedQuestionnaire)).toBe(result.savedXml);

    // The real corpus file must never have been touched.
    expect(result.sourceHashAfter).toBe(result.sourceHashBefore);
  });
});

// ---------------------------------------------------------------------------
// Colorado Character and Fitness Questionnaire.
//
// This is the file the user compared against the legacy editor: 318 KB, CRLF,
// 4-space indent, 946 CDATA leaves that all use the fully-expanded three-line
// layout (opening tag alone, "<![CDATA[...]]>" indented on its own line below,
// closing tag alone below that), 23 pre-existing <required-doc> elements, and
// hundreds of <question> elements that simply have no comment="" attribute.
// FormForge used to rewrite every one of those question lines on save.
// ---------------------------------------------------------------------------
const CO_XML_PATH = path.join(STATES_DIR, 'co', 'xml', 'forms', 'character-and-fitness-questionnaire.xml');
const coCorpusAvailable = fs.existsSync(CO_XML_PATH);

// The exact immutable fixture this regression is written against. If the file
// on disk ever differs, the expectations below are meaningless - fail loudly
// rather than silently assert against a different document.
const CO_SOURCE_SHA256 = '6ad5555f8af089d5feb09e63f95619c2da7fc10fef575c487c2bd4a617feae61';

describe.skipIf(!coCorpusAvailable)('Required Doc regression against the real CO Character and Fitness questionnaire', () => {
  beforeEach(() => {
    useFormStore.setState({ form: null, selectedNodeId: null, history: [], historyIndex: -1 });
  });

  test('Open -> addRequiredDoc -> Save changes only the questionnaire nextid and the inserted required-doc line', () => {
    expect(sha256(CO_XML_PATH)).toBe(CO_SOURCE_SHA256);
    const originalXmlOnDisk = fs.readFileSync(CO_XML_PATH, 'utf-8');

    // Fixture assumptions this test's expectations depend on.
    expect(originalXmlOnDisk).toMatch(/\r\n/);                                     // CRLF
    expect(originalXmlOnDisk).not.toMatch(/[^\r]\n/);                              // pure CRLF, no bare LF
    expect(originalXmlOnDisk).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/); // uppercase UTF-8 declaration
    expect(originalXmlOnDisk.endsWith('</questionnaire>')).toBe(true);             // no trailing newline
    expect(originalXmlOnDisk).toMatch(/\r\n {4}<validator/);                       // 4-space indent
    // Mixed layouts / absent default attrs - the two things that used to break.
    expect((originalXmlOnDisk.match(/<!\[CDATA\[/g) || []).length).toBe(946);
    expect((originalXmlOnDisk.match(/<required-doc /g) || []).length).toBe(23);
    expect(originalXmlOnDisk).toMatch(/<question id="58219004"[^>]*triggervalue="[^"]*">/); // no comment="" attr

    // Entity "Criminal" (id 149019004) - the real parent from the user's screenshot.
    const result = runAddRequiredDocScenario(
      CO_XML_PATH,
      'character-and-fitness-questionnaire.xml',
      '149019004',
      'FBI Privacy Act Statement',
    );

    // --- Phase attribution -----------------------------------------------
    // Open (parse + build, no edit at all) must be a perfect byte no-op.
    expect(result.noopDiff).toBe('');
    expect(result.noopXml).toBe(result.originalXml);
    // The model mutation must not touch the source bytes at all.
    expect(result.bytesOnDiskAfterMutation).toBe(result.originalXml);
    // ...which leaves Save as the only phase allowed to change anything.

    expect(result.nextIdBefore).toBe(2269);
    const newDocId = '226919004'; // nextid + suffix, exactly how E-Bar mints ids

    // Exactly one removed line (old root) and two added (new root + new doc).
    expect(result.removedLines).toHaveLength(1);
    expect(result.addedLines).toHaveLength(2);

    expect(result.removedLines[0]).toBe(
      '-<questionnaire id="119004" nextid="2269" suffix="19004" title="Bar Exam Application" order="0">',
    );
    const newRootLine = result.addedLines.find(l => l.includes('<questionnaire'));
    const newDocLine = result.addedLines.find(l => l.includes('<required-doc'));
    expect(newRootLine).toBe(
      '+<questionnaire id="119004" nextid="2270" suffix="19004" title="Bar Exam Application" order="0">',
    );
    expect(newDocLine).toBe(
      `+                        <required-doc id="${newDocId}" title="FBI Privacy Act Statement" preventsubmit="true"></required-doc>`,
    );

    // Nothing else moved.
    expect(result.addedLines.filter(l => l !== newRootLine && l !== newDocLine)).toHaveLength(0);

    // --- Byte-level preservation of everything the edit did not touch ------
    // Removing the two changed lines from the saved file must leave the source
    // byte-for-byte, which is a far stronger claim than "the diff looks small".
    const srcLines = result.originalXml.split('\r\n');
    const savedLines = result.savedXml.split('\r\n');
    expect(savedLines).toHaveLength(srcLines.length + 1);
    const savedWithoutInsert = savedLines.filter(l => !l.includes(`id="${newDocId}"`));
    savedWithoutInsert[1] = srcLines[1]; // the only legitimately-rewritten line
    expect(savedWithoutInsert.join('\r\n')).toBe(result.originalXml);

    // Explicit checks on the individual preservation dimensions.
    expect(result.savedXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\r\n')).toBe(true);
    expect(result.savedXml.endsWith('</questionnaire>')).toBe(true);
    expect(result.savedXml.endsWith('</questionnaire>\r\n')).toBe(false);
    expect(result.savedXml).not.toMatch(/[^\r]\n/);                       // CRLF preserved, no bare LF
    expect((result.savedXml.match(/<!\[CDATA\[/g) || []).length).toBe(946); // every CDATA leaf survives
    // ...and every one of them keeps its original three-line layout.
    expect((result.savedXml.match(/>\r\n[ \t]+<!\[CDATA\[/g) || []).length).toBe(946);
    expect((result.savedXml.match(/\]\]>\r\n[ \t]*<\//g) || []).length).toBe(946);
    expect(result.savedXml).not.toContain('><![CDATA['); // no leaf got collapsed
    // Absent default attrs are still absent - no comment="" injected.
    expect(result.savedXml).toMatch(/<question id="58219004"[^>]*triggervalue="[^"]*">/);
    expect(result.savedXml).not.toMatch(/<question id="58219004"[^>]*comment=/);
    // Entities that never had order/nextorder must not acquire them.
    expect(result.savedXml).toContain(
      '<entity id="149019004" title="Criminal " type="addmore" min="" max="" grouptype="">',
    );

    // --- Model integrity ---------------------------------------------------
    const ids = collectIds(result.reparsedQuestionnaire);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(newDocId);
    expect(result.reparsedQuestionnaire.nextId).toBe(2270);
    expect(result.reparsedQuestionnaire.nextId).toBeGreaterThan(2269);

    // Second save is byte-stable.
    expect(buildAnyXML(result.reparsedQuestionnaire)).toBe(result.savedXml);

    // The immutable corpus file was never touched.
    expect(result.sourceHashAfter).toBe(result.sourceHashBefore);
    expect(result.sourceHashAfter).toBe(CO_SOURCE_SHA256);
  });
});
