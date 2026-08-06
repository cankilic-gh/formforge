import { describe, test, expect } from 'vitest';
import JSZip from 'jszip';
import { runAiFix } from '@/lib/aiFixAgent';
import { buildEngineRulesPrompt } from '@/lib/engineRulesPrompt';
import { ELEMENTS, QUESTION_TYPES } from '@/lib/engineModel';
import { detectAttachmentKind, extractDocxText } from '@/lib/docExtract';

// Builds a minimal-but-valid single-page PDF containing the given text, with
// a correctly computed xref table (byte offsets tracked as we go) — enough
// for a real PDF reader (and the agent's own Read tool) to parse it.
const buildMinimalPdf = (text: string): Buffer => {
  const escaped = text.replace(/([()\\])/g, '\\$1');
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 612 792]/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    (() => {
      const stream = `BT /F1 14 Tf 72 700 Td (${escaped}) Tj ET`;
      return `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;
    })(),
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  const pad = (n: number) => String(n).padStart(10, '0');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${pad(off)} 00000 n \n`;
  body += xref;
  body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, 'latin1');
};

describe('buildEngineRulesPrompt (regression guard against silent coverage loss)', () => {
  const prompt = buildEngineRulesPrompt();

  test('is non-trivial in length', () => {
    expect(prompt.length).toBeGreaterThan(2000);
  });

  test('mentions every element tag from engineModel', () => {
    for (const el of ELEMENTS) {
      expect(prompt, `missing element <${el.tag}>`).toContain(`<${el.tag}>`);
    }
  });

  test('mentions every question type from engineModel', () => {
    for (const t of QUESTION_TYPES) {
      if (t.type === '') continue; // legacy empty type, rendered as "(empty)"
      expect(prompt, `missing question type "${t.type}"`).toContain(`type="${t.type}"`);
    }
  });

  test('states the nextid/id-bump rule explicitly (the #1 crash cause when adding nodes)', () => {
    expect(prompt.toLowerCase()).toContain('nextid');
    expect(prompt).toContain('bump');
  });

  test('states the CDATA rule explicitly', () => {
    expect(prompt).toContain('CDATA');
  });
});

describe('detectAttachmentKind', () => {
  test('recognizes pdf and docx by extension, case-insensitively', () => {
    expect(detectAttachmentKind('ticket.pdf')).toBe('pdf');
    expect(detectAttachmentKind('TICKET.PDF')).toBe('pdf');
    expect(detectAttachmentKind('ticket.docx')).toBe('docx');
    expect(detectAttachmentKind('TICKET.DOCX')).toBe('docx');
  });

  test('rejects legacy .doc and anything else', () => {
    expect(detectAttachmentKind('ticket.doc')).toBe('unsupported');
    expect(detectAttachmentKind('ticket.txt')).toBe('unsupported');
    expect(detectAttachmentKind('ticket')).toBe('unsupported');
  });
});

// Builds a minimal-but-real .docx (a zip with the required OOXML parts) so
// extractDocxText can be exercised against actual mammoth parsing rather than
// a mock.
const buildMinimalDocx = async (text: string): Promise<Buffer> => {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>` +
      '</w:document>'
  );
  return zip.generateAsync({ type: 'nodebuffer' });
};

describe('extractDocxText (real mammoth parsing, no network)', () => {
  test('extracts the paragraph text from a real .docx', async () => {
    const docx = await buildMinimalDocx('Please add a Middle Name field after Full Name.');
    const text = await extractDocxText(docx);
    expect(text).toBe('Please add a Middle Name field after Full Name.');
  });
});

// ---------------------------------------------------------------------------
// Live agent tests — actually call runAiFix, which spawns the Claude Agent
// SDK and authenticates via this machine's Claude subscription login (no
// ANTHROPIC_API_KEY). Opt-in only: they take real time (tens of seconds) and
// consume real subscription usage, so they must not run on every `npm test`.
//
//   RUN_LIVE_AI_FIX_TESTS=1 npx vitest run tests/aiFixAgent.test.ts
// ---------------------------------------------------------------------------
const LIVE = process.env.RUN_LIVE_AI_FIX_TESTS === '1';

const SIMPLE_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="19" nextid="100" suffix="9" order="0" title="AI Fix Test Form">
    <section id="29" title="S">
        <subsection id="39" title="SS">
            <question id="49" type="char" format="" required="true" triggervalue="" comment="">
                <description id="59" prefix="1"><![CDATA[Full Name]]></description>
            </question>
        </subsection>
    </section>
</questionnaire>
`;

const STRUCTURAL_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<questionnaire id="19" nextid="100" suffix="9" order="0" title="AI Fix Test Form">
    <section id="29" title="S">
        <subsection id="39" title="SS">
            <question id="49" type="radio" format="" required="true" triggervalue="" comment="">
                <description id="59" prefix="1"><![CDATA[Have you ever been convicted of a crime?]]></description>
                <option id="69" value="yes"><![CDATA[Yes]]></option>
                <option id="79" value="no"><![CDATA[No]]></option>
            </question>
        </subsection>
    </section>
</questionnaire>
`;

describe.skipIf(!LIVE)('AI Fix live agent (real Claude subscription call, no API key)', () => {
  test('simple text edit: changes only the requested text, stays clean', async () => {
    const result = await runAiFix({
      xml: SIMPLE_FIXTURE,
      instruction: 'Change the description text of question 1 from "Full Name" to "Full Legal Name". Do not change anything else.',
    });

    expect(result.ok, result.error).toBe(true);
    expect(result.parseOk).toBe(true);
    expect(result.finalValidation.errors).toHaveLength(0);
    expect(result.roundtripOk, JSON.stringify(result.roundtripDiffs, null, 2)).toBe(true);
    expect(result.finalXml).toContain('Full Legal Name');
    expect(result.finalXml).not.toContain('>Full Name<');
    // Scope check: only the description text should differ, nothing else.
    expect(result.semanticScopeDiff.every((d) => d.kind === 'text')).toBe(true);
  }, 180000);

  test('structural edit: adds a conditional follow-up question with correct new ids and a bumped nextid', async () => {
    const result = await runAiFix({
      xml: STRUCTURAL_FIXTURE,
      instruction:
        'Add a follow-up question that only appears when the answer to question 1 (id 49) is "Yes". It should be a text area asking the applicant to explain. Wire it up with a conditionset so it only shows conditionally.',
    });

    expect(result.ok, result.error).toBe(true);
    expect(result.parseOk).toBe(true);
    expect(result.finalValidation.errors, JSON.stringify(result.finalValidation.errors, null, 2)).toHaveLength(0);
    expect(result.roundtripOk, JSON.stringify(result.roundtripDiffs, null, 2)).toBe(true);

    // A conditional branching construct must have been added.
    expect(result.finalXml).toMatch(/<conditionset|<conditionlogic/);

    // nextid must have been bumped past every used id prefix (suffix "9").
    const nextIdMatch = result.finalXml.match(/nextid="(\d+)"/);
    expect(nextIdMatch).not.toBeNull();
    const nextId = Number(nextIdMatch![1]);
    const usedPrefixes = Array.from(result.finalXml.matchAll(/\bid="(\d+)9"/g)).map((m) => Number(m[1]));
    expect(Math.max(...usedPrefixes)).toBeLessThan(nextId);

    // No duplicate ids anywhere in the final form.
    const allIds = Array.from(result.finalXml.matchAll(/\bid="(\d+)"/g)).map((m) => m[1]);
    expect(new Set(allIds).size).toBe(allIds.length);
  }, 180000);

  test('PDF attachment: the agent reads the attached PDF (no text instruction) and applies the change it describes', async () => {
    const pdf = buildMinimalPdf('Change the description text from Full Name to Full Legal Name.');
    const result = await runAiFix({
      xml: SIMPLE_FIXTURE,
      instruction: '', // deliberately empty — everything must come from the PDF
      attachment: { filename: 'ticket.pdf', data: pdf },
    });

    expect(result.ok, result.error).toBe(true);
    expect(result.finalValidation.errors).toHaveLength(0);
    expect(result.roundtripOk, JSON.stringify(result.roundtripDiffs, null, 2)).toBe(true);
    expect(result.finalXml).toContain('Full Legal Name');
  }, 180000);

  test('docx attachment (pre-extracted to text): the agent applies the change described in the Word doc', async () => {
    const docxBuffer = await buildMinimalDocx('Change the description text from Full Name to Full Legal Name.');
    const extracted = await extractDocxText(docxBuffer);
    // Mirrors what the API route does: fold the extracted text into the
    // instruction before calling runAiFix — the agent never sees raw docx.
    const result = await runAiFix({
      xml: SIMPLE_FIXTURE,
      instruction: `Ticket attachment (ticket.docx):\n${extracted}`,
    });

    expect(result.ok, result.error).toBe(true);
    expect(result.finalValidation.errors).toHaveLength(0);
    expect(result.roundtripOk, JSON.stringify(result.roundtripDiffs, null, 2)).toBe(true);
    expect(result.finalXml).toContain('Full Legal Name');
  }, 180000);
});
