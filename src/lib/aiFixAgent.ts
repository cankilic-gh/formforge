// aiFixAgent.ts  (server-only)
//
// The "AI Fix" agentic loop. Given a form's current XML and a plain-language
// ticket instruction, drives Claude (via the Claude Agent SDK, NOT the metered
// Messages API) through the exact same workflow used to fix forms by hand
// earlier: Read the file, Edit it with small surgical replacements, get
// validation feedback after every edit, self-correct, then run the same
// parse -> validate -> roundtrip -> scope-diff gate used by the CLI before
// handing the result back for human review.
//
// Billing: this uses @anthropic-ai/claude-agent-sdk's query(), which
// authenticates via the machine's existing Claude subscription login (the
// same one Claude Code / Claude Desktop use) instead of a metered
// ANTHROPIC_API_KEY. No API key is read or required here. Each teammate needs
// to have logged in once (the same login that already lets them run Claude
// Code/Desktop) on their own machine — nothing FormForge-specific to set up.
//
// Nothing here writes to the REAL form file. The XML is written to a private
// temp directory; the agent's Read/Edit tools operate on that temp copy only.
// The caller (the API route) returns the result; the browser applies it to
// the in-memory form via setForm on Accept, same as opening a file — saving
// to disk still goes through the existing Toolbar Save flow.

import { query } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { parseAnyXML, buildAnyXML } from './xmlParser';
import { validateForm, ValidationError } from './validation';
import { diffXML, Diff } from './canonicalDiff';
import { gitStyleDiff } from './textDiff';
import { buildEngineRulesPrompt } from './engineRulesPrompt';

// Generous on purpose: a ticket that lists several distinct changes (or one
// derived from a multi-page document) needs one Read + one Edit + one
// validation round-trip PER item, plus retries. A form once hit max_turns at
// 30 with ZERO successful edits — it spent the whole budget reading/planning
// and never committed to a single Edit call. Raising the ceiling gives real
// multi-item tickets a chance; the prompt below also pushes the model to act
// on each item immediately instead of over-planning.
const DEFAULT_MAX_TURNS = 60;

// Forces the agent's final answer into this shape instead of free text, so
// "things I wasn't sure about" is a real, always-present field the UI can
// render — not something hoping to be mentioned in prose. This is the
// mechanism behind the hard rule: the agent must never silently guess and
// present a guess as a certainty; every assumption goes here instead.
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Plain-text summary of exactly what was changed or created, and why, item by item.',
    },
    uncertainties: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Every assumption, guess, ambiguous wording, or inferred detail you were not fully certain about — ' +
        'even small ones (e.g. "assumed radio Yes/No since the source did not specify a control type"). ' +
        'Empty array ONLY if there was genuinely nothing uncertain.',
    },
  },
  required: ['summary', 'uncertainties'],
  additionalProperties: false,
};

interface StructuredAgentOutput {
  summary: string;
  uncertainties: string[];
}

const isStructuredAgentOutput = (v: unknown): v is StructuredAgentOutput =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as Record<string, unknown>).summary === 'string' &&
  Array.isArray((v as Record<string, unknown>).uncertainties) &&
  (v as { uncertainties: unknown[] }).uncertainties.every((u) => typeof u === 'string');

export interface EditAttempt {
  oldString: string;
  newString: string;
}

export interface AiFixResult {
  ok: boolean;
  error?: string;
  /**
   * Every assumption, guess, or ambiguity the agent flagged about its own
   * work — always present (empty array if it reported none). Never invented
   * by this code; it's read verbatim from the agent's required structured
   * output field, so the model cannot silently omit it.
   */
  uncertainties: string[];
  finalXml: string;
  summary: string;
  edits: EditAttempt[];
  scopeDiffText: string;
  semanticScopeDiff: Diff[];
  finalValidation: { errors: ValidationError[]; warnings: ValidationError[] };
  roundtripOk: boolean;
  roundtripDiffs: Diff[];
  parseOk: boolean;
}

const summarizeValidation = (issues: ValidationError[]): string => {
  const errors = issues.filter((i) => i.type === 'error');
  const warnings = issues.filter((i) => i.type === 'warning');
  if (errors.length === 0 && warnings.length === 0) return 'Validation: clean (0 errors, 0 warnings).';
  const lines = [
    `Validation: ${errors.length} error(s), ${warnings.length} warning(s).`,
    ...errors.map((e) => `  ERROR: ${e.message}`),
    ...warnings.map((w) => `  warning: ${w.message}`),
  ];
  return lines.join('\n');
};

export interface AttachmentInput {
  /** original filename, used only to pick an extension for the temp copy */
  filename: string;
  data: Buffer;
}

export interface RunAiFixInput {
  xml: string;
  instruction: string;
  model?: string;
  /**
   * A PDF ticket attachment (docx is extracted to text by the caller and
   * folded into `instruction` instead — the agent never sees raw docx).
   * Written into the same temp dir as the form so the agent's own Read tool
   * can open it directly.
   */
  attachment?: AttachmentInput;
  /**
   * 'fix' (default): edit an existing form per a ticket. 'generate': build
   * out a form that's currently empty/skeletal from a source document —
   * same engine, just different framing since there's no "existing content"
   * to preserve and the task is usually much bigger (a whole document).
   */
  mode?: 'fix' | 'generate';
  /** Overrides DEFAULT_MAX_TURNS — generate-from-a-large-document runs may need more. */
  maxTurns?: number;
  /**
   * Fired as the agent works, so the UI can show what's actually happening
   * instead of an opaque spinner — there's no way to know total time up
   * front (it depends on document size), but turn count against maxTurns is
   * a real, known bound.
   */
  onProgress?: (event: AiFixProgressEvent) => void;
}

export interface AiFixProgressEvent {
  /** Roughly one per model turn (a batch of tool calls/reasoning) */
  turn: number;
  maxTurns: number;
  /** Human-readable description of what just happened, e.g. "Reading source.pdf" or "Edit 4 applied — 0 errors" */
  label: string;
  editsApplied: number;
}

export const runAiFix = async ({
  xml,
  instruction,
  model,
  attachment,
  mode = 'fix',
  maxTurns = DEFAULT_MAX_TURNS,
  onProgress,
}: RunAiFixInput): Promise<AiFixResult> => {
  const originalXml = xml;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'formforge-aifix-'));
  const filePath = path.join(dir, 'form.xml');
  const edits: EditAttempt[] = [];

  try {
    await fs.writeFile(filePath, originalXml, 'utf-8');

    let attachmentNote = '';
    if (attachment) {
      const ext = path.extname(attachment.filename) || '.pdf';
      const attachmentPath = path.join(dir, `ticket-attachment${ext}`);
      await fs.writeFile(attachmentPath, attachment.data);
      attachmentNote = `\n\nA source attachment is at ${attachmentPath} — Read it FIRST for the full details before touching the form.`;
    }

    const rootId = parseAnyXML(originalXml)?.id ?? '?';
    const instructionText = instruction.trim() || '(see the attached document for the full instruction)';
    const taskLine =
      mode === 'generate'
        ? `The form to build is at ${filePath} (root id="${rootId}") — it is currently empty or near-empty; you are creating its content from scratch, not preserving existing questions.`
        : `The form to edit is at ${filePath} (root id="${rootId}"). Read it first.`;

    const userPrompt = `Instruction:\n${instructionText}${attachmentNote}\n\n${taskLine}

If the source describes MULTIPLE distinct items (a list of changes, several questions, a whole document of fields/sections), work through them ONE AT A TIME: for each item, locate or decide on the exact content via Read, then IMMEDIATELY call Edit before moving to the next item. Do not read/plan the whole thing over and over trying to get everything perfect before making a single edit — start editing as soon as you're confident about the first item, and use the validation feedback you get after each edit to catch problems along the way. Planning extensively without ever calling Edit is the single most common failure mode here — avoid it. It is completely fine to make a small mistake and fix it on the next edit; it is not fine to spend your whole turn budget reading/planning and never editing.

Use the Edit tool for small, precise replacements — never rewrite the whole file in one Edit. After each edit you will be told the current validation result as additional context; fix any errors before continuing to the next item.

You must NEVER present a guess as a certainty. Whenever you are not fully sure about something — an ambiguous instruction, a detail the source didn't specify (a field's exact type, whether something is required, how a value should be worded), a judgment call you made about structure — you MUST record it as a short, specific entry in the required "uncertainties" field of your final answer, even if you went ahead with your best guess. Only leave "uncertainties" empty if literally everything was unambiguous. This is a hard requirement, not a suggestion.

When every item has been addressed, produce your final answer in the required structured format: "summary" (plain text — exactly what you changed/created and why, item by item, including anything you could not do and why) and "uncertainties" (see above). Make no further tool calls once you produce this final answer.`;

    let turnCount = 0;

    const q = query({
      prompt: userPrompt,
      options: {
        cwd: dir,
        tools: ['Read', 'Edit'],
        allowedTools: ['Read', 'Edit'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns,
        systemPrompt: buildEngineRulesPrompt(),
        model,
        outputFormat: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        hooks: {
          PostToolUse: [
            {
              hooks: [
                async (input) => {
                  if (input.hook_event_name !== 'PostToolUse' || input.tool_name !== 'Edit') return {};
                  const toolInput = input.tool_input as { old_string?: string; new_string?: string } | undefined;
                  if (toolInput?.old_string !== undefined && toolInput?.new_string !== undefined) {
                    edits.push({ oldString: toolInput.old_string, newString: toolInput.new_string });
                  }
                  let additionalContext: string;
                  let issueCount = 0;
                  try {
                    const currentXml = await fs.readFile(filePath, 'utf-8');
                    const parsed = parseAnyXML(currentXml);
                    if (parsed) {
                      const issues = validateForm(parsed);
                      issueCount = issues.filter((i) => i.type === 'error').length;
                      additionalContext = summarizeValidation(issues);
                    } else {
                      additionalContext = 'The file is no longer well-formed, parseable XML after that edit. Fix the XML structure before continuing.';
                    }
                  } catch (err) {
                    additionalContext = `Could not re-read the file after the edit: ${err instanceof Error ? err.message : String(err)}`;
                  }
                  onProgress?.({
                    turn: turnCount,
                    maxTurns,
                    label: `Edit ${edits.length} applied — ${issueCount === 0 ? '0 errors' : `${issueCount} error(s)`}`,
                    editsApplied: edits.length,
                  });
                  return {
                    hookSpecificOutput: {
                      hookEventName: 'PostToolUse' as const,
                      additionalContext,
                    },
                  };
                },
              ],
            },
          ],
        },
      },
    });

    let summary = '';
    let uncertainties: string[] = [];
    let ok = true;
    let errorMsg: string | undefined;
    for await (const message of q) {
      if (message.type === 'assistant') {
        turnCount++;
        for (const block of message.message.content) {
          if (block.type !== 'tool_use') continue;
          const input = block.input as { file_path?: string } | undefined;
          const label =
            block.name === 'Read'
              ? `Reading ${input?.file_path ? path.basename(input.file_path) : 'file'}`
              : block.name === 'Edit'
                ? 'Applying an edit…'
                : `Using ${block.name}`;
          onProgress?.({ turn: turnCount, maxTurns, label, editsApplied: edits.length });
        }
      }
      if (message.type === 'result') {
        if (message.subtype === 'success') {
          if (isStructuredAgentOutput(message.structured_output)) {
            summary = message.structured_output.summary;
            uncertainties = message.structured_output.uncertainties;
          } else {
            // Structured output missing/malformed (shouldn't happen given
            // outputFormat, but never let a formatting hiccup hide the fact
            // that we don't actually know what was uncertain here).
            summary = message.result;
            uncertainties = ['The agent did not return its required uncertainty report in the expected format — review this result especially carefully.'];
          }
        } else {
          ok = false;
          errorMsg = message.errors.length ? message.errors.join('; ') : `Agent stopped: ${message.subtype}`;
        }
      }
    }

    return await buildResult({ originalXml, filePath, edits, ok, error: errorMsg, summary, uncertainties });
  } catch (err) {
    // The agent loop itself threw (e.g. the SDK gave up retrying structured
    // output) — but any edits already applied are still sitting in the temp
    // file on disk. Losing sight of that here would silently discard real,
    // already-validated progress (`edits` already has them) and report "no
    // changes" purely because of a late, unrelated failure. Best-effort
    // re-read the file before falling back to the pristine original.
    const errorMsg = err instanceof Error ? err.message : String(err);
    try {
      return await buildResult({ originalXml, filePath, edits, ok: false, error: errorMsg, summary: '', uncertainties: [] });
    } catch {
      return {
        ok: false,
        error: errorMsg,
        finalXml: originalXml,
        summary: '',
        uncertainties: [],
        edits,
        scopeDiffText: '',
        semanticScopeDiff: [],
        finalValidation: { errors: [], warnings: [] },
        roundtripOk: false,
        roundtripDiffs: [],
        parseOk: false,
      };
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

const buildResult = async ({
  originalXml,
  filePath,
  edits,
  ok,
  error,
  summary,
  uncertainties,
}: {
  originalXml: string;
  filePath: string;
  edits: EditAttempt[];
  ok: boolean;
  error?: string;
  summary: string;
  uncertainties: string[];
}): Promise<AiFixResult> => {
  const currentXml = await fs.readFile(filePath, 'utf-8');
  const finalParsed = parseAnyXML(currentXml);
  const parseOk = finalParsed !== null;
  let finalIssues: ValidationError[] = [];
  let roundtripOk = false;
  let roundtripDiffs: Diff[] = [];

  if (finalParsed) {
    finalIssues = validateForm(finalParsed);
    const rebuilt = buildAnyXML(finalParsed);
    roundtripDiffs = diffXML(currentXml, rebuilt);
    roundtripOk = roundtripDiffs.length === 0;
  }

  const scopeDiffText = await gitStyleDiff(originalXml, currentXml, { old: 'original.xml', new: 'ai-proposed.xml' });
  const semanticScopeDiff = diffXML(originalXml, currentXml);

  return {
    ok,
    error,
    finalXml: currentXml,
    summary: summary || '(the model made no changes)',
    uncertainties,
    edits,
    scopeDiffText,
    semanticScopeDiff,
    finalValidation: {
      errors: finalIssues.filter((i) => i.type === 'error'),
      warnings: finalIssues.filter((i) => i.type === 'warning'),
    },
    roundtripOk,
    roundtripDiffs,
    parseOk,
  };
};
