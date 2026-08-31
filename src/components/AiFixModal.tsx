'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStore } from '@/stores/formStore';
import { useModal } from '@/components/Modal';
import { buildAnyXML, parseAnyXML } from '@/lib/xmlParser';
import { DiffView, countDiff } from '@/components/DiffView';
import { readAiFixResponse, AiFixProgressEvent } from '@/lib/aiFixStream';
import { X, Sparkles, Loader2, CheckCircle2, AlertCircle, AlertTriangle, ListChecks, Paperclip, FileText, HelpCircle } from 'lucide-react';

interface AiFixModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EditAttempt {
  oldString: string;
  newString: string;
}
interface ValidationIssue { type: 'error' | 'warning'; message: string; nodeIds?: string[] }
interface AiFixResponse {
  ok: boolean;
  error?: string;
  finalXml: string;
  summary: string;
  /** Every assumption/guess the agent flagged about its own work — always present. */
  uncertainties: string[];
  edits: EditAttempt[];
  scopeDiffText: string;
  finalValidation: { errors: ValidationIssue[]; warnings: ValidationIssue[] };
  roundtripOk: boolean;
  parseOk: boolean;
}

type Step = 'input' | 'running' | 'review' | 'error';

export const AiFixModal: React.FC<AiFixModalProps> = ({ isOpen, onClose }) => {
  const { form, setForm } = useFormStore();
  const { showAlert, showConfirm } = useModal();

  const [instruction, setInstruction] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('input');
  const [result, setResult] = useState<AiFixResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks the in-flight request so closing mid-run can actually abort it —
  // without this, closing while "running" looked like a cancel to the user
  // but the fetch (and the server-side agent) kept going, and a late response
  // could silently mutate state after the modal was already reset.
  const abortRef = useRef<AbortController | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  // Live activity feed from the server (turn/tool-call level) — there's no
  // way to know total time up front (depends on document size), but turn
  // count against maxTurns is a real, known bound, and a step's worth of
  // labels beats a bare spinner for telling "still working" from "frozen".
  const [progress, setProgress] = useState<AiFixProgressEvent | null>(null);
  const [progressLog, setProgressLog] = useState<string[]>([]);

  // A real multi-item ticket can legitimately take minutes (read the
  // document, edit + validate each item). Without any feedback that looks
  // identical to a hang — this just proves it's still alive and roughly how
  // long it's been.
  useEffect(() => {
    if (step !== 'running') { setElapsedSec(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [step]);

  const reset = () => {
    setInstruction('');
    setAttachment(null);
    setStep('input');
    setResult(null);
    setErrorMsg('');
    setProgress(null);
    setProgressLog([]);
  };

  const closeNow = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    reset();
    onClose();
  };

  // Guards against accidentally closing while there's something to lose:
  // a run in progress (closing aborts it), or a proposed fix not yet
  // accepted/discarded on purpose. Closing from 'input'/'error' is free —
  // nothing would be lost.
  const handleClose = async () => {
    if (step === 'running') {
      const confirmed = await showConfirm(
        'Cancel AI Fix?',
        'AI Fix is still running. Closing now will cancel it and any progress made so far will be lost. Close anyway?'
      );
      if (!confirmed) return;
    } else if (step === 'review') {
      const confirmed = await showConfirm(
        'Discard Proposed Fix?',
        'You have not accepted this fix yet. Closing now will discard it. Close anyway?'
      );
      if (!confirmed) return;
    }
    closeNow();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) {
      await showAlert(
        'Unsupported File',
        'Only PDF and modern Word (.docx) files are supported. Legacy .doc isn\'t — please re-save as .docx or export to PDF.'
      );
      return;
    }
    setAttachment(file);
  };

  const handleRun = async () => {
    if (!form || (!instruction.trim() && !attachment)) return;
    setStep('running');
    setProgress(null);
    setProgressLog([]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const body = new FormData();
      body.set('xml', buildAnyXML(form));
      body.set('instruction', instruction);
      if (attachment) body.set('attachment', attachment);
      const res = await fetch('/api/ai/fix', { method: 'POST', body, signal: controller.signal });
      const data = await readAiFixResponse<AiFixResponse>(res, (event) => {
        setProgress(event);
        setProgressLog((log) => [...log.slice(-49), event.label]);
      });
      // A request-level failure (bad upload, missing instruction) never even
      // started the agent — there's no partial result, just show the error.
      // But when the agent DID run and stopped early (e.g. ran out of turns
      // on a big multi-item ticket), `data` still carries whatever edits it
      // managed to apply before stopping — show that in review with a
      // warning banner instead of throwing it away.
      if (!data.ok && !Array.isArray(data.edits)) {
        setErrorMsg(data.error || 'AI Fix failed for an unknown reason.');
        setStep('error');
        return;
      }
      setResult(data);
      setStep('review');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // closed intentionally, not a failure
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleAccept = async () => {
    if (!result) return;
    const parsed = parseAnyXML(result.finalXml);
    if (!parsed) {
      await showAlert('Cannot Apply', 'The AI-proposed XML could not be parsed. Nothing was changed — please discard and try again with a clearer instruction.');
      return;
    }
    // Same in-memory ingestion path Toolbar's handleOpen uses. Deliberately does
    // NOT touch reloadBaselineXml/savedBaselineXml — this is an edit to the
    // currently open form, not opening a new file, so it should show as
    // "unsaved" exactly like any other edit until the user hits Save.
    setForm(parsed);
    closeNow(); // accepting is not a discard — skip the "are you sure" prompt
  };

  if (!isOpen) return null;

  const diffCounts = result ? countDiff(result.scopeDiffText) : { add: 0, del: 0 };
  const hasErrors = (result?.finalValidation.errors.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-[860px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-600" />
            <h2 className="text-lg font-semibold text-slate-800">AI Fix</h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {step === 'input' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Paste the ticket instruction below. The AI will edit the currently open form
                (<span className="font-medium text-slate-800">{form?.title}</span>), validating and
                self-correcting as it goes. You&apos;ll review a diff before anything is applied — nothing
                is saved to disk until you click Save afterward.
              </p>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={`Describe the fix, e.g.:\n\nQuestion 21: add the word "EVER" in bold before "filed" in the question text.\n\nAdd a follow-up question after Q5 that only shows when the answer is Yes, asking for an explanation (text area).\n\n(Or just attach the ticket's PDF/Word doc below and leave this blank.)`}
                className="w-full h-48 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-800 placeholder-slate-400 resize-none font-mono"
              />

              {attachment ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <FileText className="w-4 h-4 shrink-0 text-slate-500" />
                  <span className="flex-1 truncate text-sm text-slate-700">{attachment.name}</span>
                  <button onClick={() => setAttachment(null)} className="p-1 hover:bg-slate-200 rounded">
                    <X className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-cyan-400 hover:bg-cyan-50/30">
                  <Paperclip className="w-4 h-4" />
                  Attach ticket PDF or Word doc (optional)
                  <input ref={fileInputRef} type="file" accept=".pdf,.docx" onChange={handleFileChange} className="hidden" />
                </label>
              )}

              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                <p className="text-xs text-cyan-700">
                  <strong>Tip:</strong> Be specific — quote the exact question number or text where possible.
                  The AI follows the same rules and validation gate used for manual fixes, including
                  structural changes (new conditional questions, options, etc.).
                </p>
              </div>
            </div>
          )}

          {step === 'running' && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 py-6 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
              <p className="text-center text-sm">
                {progress?.label || 'Starting…'}
                {elapsedSec >= 3 ? ` — ${elapsedSec}s elapsed` : ''}
              </p>

              {progress && (
                <div className="w-full max-w-sm">
                  <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                    <span>Turn {progress.turn} of up to {progress.maxTurns}</span>
                    <span>{progress.editsApplied} edit(s) applied</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all"
                      style={{ width: `${Math.min(100, (progress.turn / progress.maxTurns) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    A bound, not an ETA — it can finish well before the last turn.
                  </p>
                </div>
              )}

              {progressLog.length > 0 && (
                <div className="max-h-32 w-full max-w-sm overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-500">
                  {progressLog.map((line, i) => (
                    <div key={i} className={i === progressLog.length - 1 ? 'font-medium text-slate-700' : ''}>
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {elapsedSec >= 45 && (
                <p className="max-w-sm text-center text-xs text-slate-400">
                  Multi-item tickets or long documents can take a few minutes — it&apos;s reading and
                  editing one item at a time. Still working; you can cancel below if needed.
                </p>
              )}
            </div>
          )}

          {step === 'error' && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === 'review' && result && (
            <div className="space-y-4">
              {!result.ok && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Did not finish — {result.edits.length > 0 ? `${result.edits.length} edit(s) were applied before it stopped` : 'no edits were applied'}.</p>
                    <p className="mt-1 text-amber-700">{result.error || 'The agent stopped before completing the ticket.'}</p>
                    <p className="mt-1 text-amber-700">
                      {result.edits.length > 0
                        ? 'Review what it managed to do below. You can Accept the partial progress and run AI Fix again for the rest, or Discard and try a more specific/shorter instruction.'
                        : 'Nothing was changed — it may help to split the ticket into smaller, more specific instructions.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{result.summary}</p>
              </div>

              {result.uncertainties.length > 0 ? (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                    <HelpCircle className="w-4 h-4" /> Not certain about this ({result.uncertainties.length}) — review before accepting
                  </h3>
                  <ul className="space-y-1.5 text-sm text-amber-800">
                    {result.uncertainties.map((u, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0">•</span>
                        <span>{u}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" /> The agent reported nothing it was unsure about.
                </div>
              )}

              {hasErrors ? (
                <div className="rounded-lg border border-red-200 bg-white p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
                    <AlertCircle className="w-4 h-4" /> Validation errors ({result.finalValidation.errors.length}) — do not accept
                  </h3>
                  <div className="max-h-40 space-y-1 overflow-auto text-xs text-red-600">
                    {result.finalValidation.errors.map((e, i) => <div key={i}>● {e.message}</div>)}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                  <CheckCircle2 className="w-4 h-4" /> No validation errors.
                </div>
              )}

              {result.finalValidation.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5" /> Warnings ({result.finalValidation.warnings.length})
                  </h3>
                  <div className="max-h-32 space-y-1 overflow-auto text-xs text-amber-600">
                    {result.finalValidation.warnings.map((w, i) => <div key={i}>▲ {w.message}</div>)}
                  </div>
                </div>
              )}

              {!result.roundtripOk && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  Round-trip check found differences after re-parsing the AI&apos;s XML — review the diff carefully.
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Diff — original vs AI-proposed{' '}
                  <span className="text-xs font-normal text-slate-400">
                    (<span className="text-green-600">+{diffCounts.add}</span> <span className="text-red-600">-{diffCounts.del}</span>)
                  </span>
                </h3>
                {result.scopeDiffText.trim() ? (
                  <DiffView diff={result.scopeDiffText} />
                ) : (
                  <p className="text-sm text-slate-400">No changes were made.</p>
                )}
              </div>

              {result.edits.length > 0 && (
                <details className="rounded-lg border border-slate-200 bg-white p-3">
                  <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <ListChecks className="w-3.5 h-3.5" /> {result.edits.length} edit(s) applied
                  </summary>
                  <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                    {result.edits.map((e, i) => (
                      <div key={i} className="rounded border border-slate-100 bg-slate-50 p-2 text-[11px]">
                        <div className="font-mono text-slate-500 truncate">- {e.oldString.slice(0, 100)}</div>
                        <div className="font-mono text-slate-700 truncate">+ {e.newString.slice(0, 100)}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50">
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button onClick={handleClose} className="btn btn-ghost">
              {step === 'review' ? 'Discard' : 'Cancel'}
            </button>
            {step === 'input' && (
              <button
                onClick={handleRun}
                disabled={(!instruction.trim() && !attachment) || !form}
                className="btn btn-primary disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                Fix Form
              </button>
            )}
            {step === 'error' && (
              <button onClick={() => setStep('input')} className="btn btn-primary">
                Back
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={handleAccept}
                disabled={hasErrors || !result?.parseOk}
                className="btn btn-primary disabled:opacity-50"
                title={hasErrors ? 'Fix the validation errors before applying' : undefined}
              >
                <CheckCircle2 className="w-4 h-4" />
                Accept
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
