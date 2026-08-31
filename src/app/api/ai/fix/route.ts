import { NextRequest, NextResponse } from 'next/server';
import { runAiFix, AiFixProgressEvent } from '@/lib/aiFixAgent';
import { detectAttachmentKind, extractDocxText, UNSUPPORTED_ATTACHMENT_MESSAGE } from '@/lib/docExtract';

export const dynamic = 'force-dynamic';

// POST /api/ai/fix
// multipart/form-data fields: xml (string, required), instruction (string,
// required unless an attachment is provided), attachment (File, optional —
// PDF or modern Word .docx), mode (string, optional — "fix" (default) or
// "generate"; same engine, see runAiFix's mode param).
//
// Runs the AI Fix agentic loop (edit -> validate -> self-correct) against the
// form XML the caller currently has open and returns a reviewable result —
// nothing is written to disk here; the browser applies the result to the
// in-memory form on Accept, same as opening a file.
//
// No ANTHROPIC_API_KEY is used or required: runAiFix authenticates via the
// machine's existing Claude subscription login (Claude Code / Claude
// Desktop), so usage draws from that subscription's included usage instead
// of metered API billing.
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid form data body.' }, { status: 400 });
  }

  const xml = formData.get('xml');
  if (!xml || typeof xml !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing "xml" in request body.' }, { status: 400 });
  }

  const instructionRaw = formData.get('instruction');
  const instruction = typeof instructionRaw === 'string' ? instructionRaw : '';

  const modeRaw = formData.get('mode');
  const mode = modeRaw === 'generate' ? 'generate' : 'fix';

  const file = formData.get('attachment');
  const hasAttachment = file instanceof File && file.size > 0;

  if (!instruction.trim() && !hasAttachment) {
    return NextResponse.json(
      { ok: false, error: 'Provide an instruction, an attachment, or both.' },
      { status: 400 }
    );
  }

  let effectiveInstruction = instruction;
  let pdfAttachment: { filename: string; data: Buffer } | undefined;

  if (hasAttachment) {
    const uploaded = file as File;
    const kind = detectAttachmentKind(uploaded.name);
    if (kind === 'unsupported') {
      return NextResponse.json({ ok: false, error: UNSUPPORTED_ATTACHMENT_MESSAGE }, { status: 400 });
    }
    const buffer = Buffer.from(await uploaded.arrayBuffer());
    if (kind === 'docx') {
      let docText: string;
      try {
        docText = await extractDocxText(buffer);
      } catch (err) {
        return NextResponse.json(
          { ok: false, error: `Could not read the .docx attachment: ${err instanceof Error ? err.message : String(err)}` },
          { status: 400 }
        );
      }
      effectiveInstruction = [instruction.trim(), `Ticket attachment (${uploaded.name}):\n${docText}`]
        .filter(Boolean)
        .join('\n\n');
    } else {
      // PDF: pass through as a file for the agent's own Read tool.
      pdfAttachment = { filename: uploaded.name, data: buffer };
    }
  }

  // Streamed as SSE rather than a single JSON response: a full-document
  // generate run can take 15-30+ minutes, and with no other signal the
  // client has nothing to show but an opaque elapsed-time counter. Each
  // `onProgress` call becomes one "data: {...}\n\n" event; the last event
  // (type: 'result') carries the same AiFixResult shape the client used to
  // get back directly from the JSON response.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        const result = await runAiFix({
          xml,
          instruction: effectiveInstruction,
          model: process.env.AI_FIX_MODEL,
          attachment: pdfAttachment,
          mode,
          onProgress: (event: AiFixProgressEvent) => send({ type: 'progress', ...event }),
        });
        send({ type: 'result', ...result });
      } catch (err) {
        send({ type: 'result', ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
