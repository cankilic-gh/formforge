'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStore } from '@/stores/formStore';
import { useModal } from '@/components/Modal';
import { buildAnyXML, parseAnyXML } from '@/lib/xmlParser';
import { walkNodes } from '@/lib/validation';
import { DiffView, countDiff } from '@/components/DiffView';
import { readAiFixResponse, AiFixProgressEvent } from '@/lib/aiFixStream';
import {
  X, Wand2, FileText, Upload, Sparkles, Loader2, CheckCircle2, AlertCircle,
  AlertTriangle, ListChecks, Paperclip, HelpCircle,
} from 'lucide-react';
import { QuestionType } from '@/types/form';

interface DetectedField {
  label: string;
  type: QuestionType;
  format?: string;
  confidence: 'high' | 'medium' | 'low';
}

interface SmartFormGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
}

// Pattern rules for detecting field types
const FIELD_PATTERNS: { pattern: RegExp; type: QuestionType; format?: string; confidence: 'high' | 'medium' | 'low' }[] = [
  // Names
  { pattern: /\b(first\s*name|given\s*name|forename)\b/i, type: 'char', confidence: 'high' },
  { pattern: /\b(last\s*name|family\s*name|surname)\b/i, type: 'char', confidence: 'high' },
  { pattern: /\b(middle\s*name|middle\s*initial)\b/i, type: 'char', confidence: 'high' },
  { pattern: /\b(full\s*name|name)\b/i, type: 'char', confidence: 'medium' },

  // Contact
  { pattern: /\b(email|e-mail)\b/i, type: 'char', format: 'email', confidence: 'high' },
  { pattern: /\b(phone|telephone|cell|mobile)\b/i, type: 'char', confidence: 'high' },
  { pattern: /\b(fax)\b/i, type: 'char', confidence: 'high' },

  // Address
  { pattern: /\b(street\s*address|address\s*line|address)\b/i, type: 'char', confidence: 'high' },
  { pattern: /\b(city|town)\b/i, type: 'char', confidence: 'high' },
  { pattern: /\b(state|province)\b/i, type: 'state', confidence: 'high' },
  { pattern: /\b(country)\b/i, type: 'country', confidence: 'high' },
  { pattern: /\b(zip|postal\s*code|zip\s*code)\b/i, type: 'zip', confidence: 'high' },
  { pattern: /\b(county)\b/i, type: 'county', confidence: 'high' },

  // Dates
  { pattern: /\b(date\s*of\s*birth|birth\s*date|dob|birthday)\b/i, type: 'date', format: 'dob_mm/dd/yy', confidence: 'high' },
  { pattern: /\b(start\s*date|from\s*date|begin\s*date)\b/i, type: 'date', format: 'mm/yy', confidence: 'high' },
  { pattern: /\b(end\s*date|to\s*date|through\s*date)\b/i, type: 'date', format: 'present_mm/yy', confidence: 'high' },
  { pattern: /\b(date)\b/i, type: 'date', confidence: 'medium' },

  // Identity
  { pattern: /\b(ssn|social\s*security|social\s*security\s*number)\b/i, type: 'ssn', confidence: 'high' },
  { pattern: /\b(signature)\b/i, type: 'signature', confidence: 'high' },

  // Education/Legal
  { pattern: /\b(law\s*school|school\s*name)\b/i, type: 'lawschool', confidence: 'high' },
  { pattern: /\b(school|university|college|institution)\b/i, type: 'char', confidence: 'medium' },

  // Yes/No Questions (detect question marks or specific patterns)
  { pattern: /\b(have\s*you|are\s*you|do\s*you|did\s*you|were\s*you|is\s*there|was\s*there)\b.*\?/i, type: 'radio', confidence: 'high' },
  { pattern: /\b(yes\s*\/\s*no|yes\s*or\s*no)\b/i, type: 'radio', confidence: 'high' },

  // Text areas (long descriptions)
  { pattern: /\b(describe|explain|details|comments|notes|reason|explanation)\b/i, type: 'text', confidence: 'medium' },

  // Employment
  { pattern: /\b(employer|company\s*name|organization|firm)\b/i, type: 'char', confidence: 'high' },
  { pattern: /\b(job\s*title|position|title|occupation)\b/i, type: 'char', confidence: 'high' },
  { pattern: /\b(salary|income|compensation)\b/i, type: 'char', format: 'integer', confidence: 'medium' },
];

// Detect fields from text
const detectFields = (text: string): DetectedField[] => {
  const lines = text.split(/[\n\r]+/).filter(line => line.trim());
  const detectedFields: DetectedField[] = [];
  const usedPatterns = new Set<string>();

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.length < 2) continue;

    let matched = false;

    for (const rule of FIELD_PATTERNS) {
      if (rule.pattern.test(trimmedLine)) {
        // Extract the label (clean up the line)
        let label = trimmedLine
          .replace(/[:*?]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Capitalize first letter of each word
        label = label.split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');

        // Avoid duplicates
        const key = `${label}-${rule.type}`;
        if (!usedPatterns.has(key)) {
          usedPatterns.add(key);
          detectedFields.push({
            label,
            type: rule.type,
            format: rule.format,
            confidence: rule.confidence,
          });
          matched = true;
          break;
        }
      }
    }

    // If no pattern matched but looks like a field label, default to char
    if (!matched && /^[A-Za-z][\w\s]{2,50}[:*]?\s*$/.test(trimmedLine)) {
      let label = trimmedLine.replace(/[:*]/g, '').trim();
      label = label.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');

      const key = `${label}-char`;
      if (!usedPatterns.has(key)) {
        usedPatterns.add(key);
        detectedFields.push({
          label,
          type: 'char',
          confidence: 'low',
        });
      }
    }
  }

  return detectedFields;
};

// --- AI document-driven generate (mirrors AiFixModal's response shape) ---

interface EditAttempt {
  oldString: string;
  newString: string;
}
interface ValidationIssue { type: 'error' | 'warning'; message: string; nodeIds?: string[] }
interface AiGenerateResponse {
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

type GenMode = 'fields' | 'ai';
type AiStep = 'input' | 'running' | 'review' | 'error';

export const SmartFormGenerator: React.FC<SmartFormGeneratorProps> = ({ isOpen, onClose }) => {
  const [inputText, setInputText] = useState('');
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [step, setStep] = useState<'input' | 'review'>('input');
  const { form, selectedNodeId, findNodeById, addQuestionWithText, saveToHistory, setForm } = useFormStore();
  const { showAlert, showConfirm } = useModal();

  // Which half of this modal is active: the free, instant field-list detector
  // (unchanged, no AI cost) or the AI-driven document generator (PDF/Word,
  // slower, draws from the Claude subscription — see aiFixLiveTestingCostCaution).
  const [genMode, setGenMode] = useState<GenMode>('ai');

  // --- AI mode state ---
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiAttachment, setAiAttachment] = useState<File | null>(null);
  const [aiStep, setAiStep] = useState<AiStep>('input');
  const [aiResult, setAiResult] = useState<AiGenerateResponse | null>(null);
  const [aiErrorMsg, setAiErrorMsg] = useState('');
  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const [aiElapsedSec, setAiElapsedSec] = useState(0);
  const [aiProgress, setAiProgress] = useState<AiFixProgressEvent | null>(null);
  const [aiProgressLog, setAiProgressLog] = useState<string[]>([]);

  useEffect(() => {
    if (aiStep !== 'running') { setAiElapsedSec(0); return; }
    const start = Date.now();
    const id = setInterval(() => setAiElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [aiStep]);

  const resetAll = () => {
    setInputText('');
    setDetectedFields([]);
    setStep('input');
    setGenMode('ai');
    setAiInstruction('');
    setAiAttachment(null);
    setAiStep('input');
    setAiResult(null);
    setAiErrorMsg('');
    setAiProgress(null);
    setAiProgressLog([]);
  };

  const closeNow = () => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    resetAll();
    onClose();
  };

  const handleClose = async () => {
    if (aiStep === 'running') {
      const confirmed = await showConfirm(
        'Cancel Generate?',
        'AI Generate is still running. Closing now will cancel it and any progress made so far will be lost. Close anyway?'
      );
      if (!confirmed) return;
    } else if (aiStep === 'review') {
      const confirmed = await showConfirm(
        'Discard Generated Content?',
        'You have not accepted this yet. Closing now will discard it. Close anyway?'
      );
      if (!confirmed) return;
    }
    closeNow();
  };

  const handleAnalyze = () => {
    const fields = detectFields(inputText);
    setDetectedFields(fields);
    setStep('review');
  };

  const handleGenerate = async () => {
    if (!form || !selectedNodeId) {
      await showAlert('Selection Required', 'Please select a subsection or entity first.');
      return;
    }

    const parent = findNodeById(selectedNodeId);
    if (!parent || !['subsection', 'entity', 'conditional'].includes(parent.nodeType)) {
      await showAlert('Invalid Selection', 'Please select a subsection, entity, or conditional to add questions.');
      return;
    }

    // Add each detected field as a question with proper text
    for (const field of detectedFields) {
      addQuestionWithText(selectedNodeId, field.type, field.label, field.format);
    }

    // Save to history once after all additions
    saveToHistory();
    closeNow();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setInputText(text);
    };
    reader.readAsText(file);
  };

  const removeField = (index: number) => {
    setDetectedFields(fields => fields.filter((_, i) => i !== index));
  };

  const updateFieldType = (index: number, type: QuestionType) => {
    setDetectedFields(fields => fields.map((field, i) =>
      i === index ? { ...field, type } : field
    ));
  };

  const getTypeLabel = (type: QuestionType): string => {
    const labels: Record<string, string> = {
      char: 'Text Input',
      text: 'Text Area',
      radio: 'Yes/No Radio',
      select: 'Dropdown',
      date: 'Date',
      state: 'State Select',
      country: 'Country Select',
      zip: 'ZIP Code',
      ssn: 'SSN',
      signature: 'Signature',
      lawschool: 'Law School',
      county: 'County',
    };
    return labels[type] || type;
  };

  const getConfidenceColor = (confidence: string): string => {
    switch (confidence) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-amber-600';
      case 'low': return 'text-orange-600';
      default: return 'text-slate-400';
    }
  };

  // --- AI mode handlers ---

  const handleAiFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setAiAttachment(file);
  };

  const countExistingQuestions = (): number => {
    if (!form) return 0;
    let count = 0;
    walkNodes(form, (n) => { if (n.nodeType === 'question') count++; });
    return count;
  };

  const handleAiRun = async () => {
    if (!form || (!aiInstruction.trim() && !aiAttachment)) return;

    const existingQuestions = countExistingQuestions();
    if (existingQuestions > 0) {
      const confirmed = await showConfirm(
        'Form Already Has Content',
        `AI Generate is meant for building a form from scratch — it's told to create content rather than preserve what's already there. "${form.title}" already has ${existingQuestions} question(s). Continuing could overwrite or duplicate existing content.\n\nIf you meant to build a brand-new form, use File > New first, then Generate. Continue anyway?`
      );
      if (!confirmed) return;
    }

    setAiStep('running');
    setAiProgress(null);
    setAiProgressLog([]);
    const controller = new AbortController();
    aiAbortRef.current = controller;
    try {
      const body = new FormData();
      body.set('xml', buildAnyXML(form));
      body.set('instruction', aiInstruction);
      body.set('mode', 'generate');
      if (aiAttachment) body.set('attachment', aiAttachment);
      const res = await fetch('/api/ai/fix', { method: 'POST', body, signal: controller.signal });
      const data = await readAiFixResponse<AiGenerateResponse>(res, (event) => {
        setAiProgress(event);
        setAiProgressLog((log) => [...log.slice(-49), event.label]);
      });
      if (!data.ok && !Array.isArray(data.edits)) {
        setAiErrorMsg(data.error || 'AI Generate failed for an unknown reason.');
        setAiStep('error');
        return;
      }
      setAiResult(data);
      setAiStep('review');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setAiErrorMsg(err instanceof Error ? err.message : String(err));
      setAiStep('error');
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
    }
  };

  const handleAiAccept = async () => {
    if (!aiResult) return;
    const parsed = parseAnyXML(aiResult.finalXml);
    if (!parsed) {
      await showAlert('Cannot Apply', 'The AI-generated XML could not be parsed. Nothing was changed — please discard and try again with a clearer instruction or document.');
      return;
    }
    setForm(parsed);
    closeNow();
  };

  if (!isOpen) return null;

  const aiDiffCounts = aiResult ? countDiff(aiResult.scopeDiffText) : { add: 0, del: 0 };
  const aiHasErrors = (aiResult?.finalValidation.errors.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-[860px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-cyan-600" />
            <h2 className="text-lg font-semibold text-slate-800">AI Generate</h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Mode switch — only shown before either flow has committed to a step */}
        {step === 'input' && aiStep === 'input' && (
          <div className="flex gap-1 border-b border-slate-100 bg-slate-50 p-2">
            <button
              onClick={() => setGenMode('ai')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${genMode === 'ai' ? 'bg-white shadow-sm text-cyan-700 border border-cyan-200' : 'text-slate-500 hover:bg-white/60'}`}
            >
              AI: PDF / Word Document
            </button>
            <button
              onClick={() => setGenMode('fields')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${genMode === 'fields' ? 'bg-white shadow-sm text-cyan-700 border border-cyan-200' : 'text-slate-500 hover:bg-white/60'}`}
            >
              Paste Field List
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {genMode === 'fields' && step === 'input' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Paste form field labels or upload a plain text file. The system will automatically detect field types.
                This is instant and free — for a real ticket document with sections, conditionals, or structure, use
                the &quot;AI: PDF / Word Document&quot; tab above instead.
              </p>

              {/* File Upload */}
              <div className="flex items-center gap-2">
                <label className="btn btn-ghost cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Upload .txt File</span>
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-slate-500">or paste text below</span>
              </div>

              {/* Text Input */}
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Paste form fields here, one per line. Examples:

First Name
Last Name
Email
Phone Number
Street Address
City
State
ZIP Code
Date of Birth
Have you ever been convicted of a crime?
Please describe your work experience:`}
                className="w-full h-64 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-800 placeholder-slate-400 resize-none font-mono"
              />

              {/* Example */}
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                <p className="text-xs text-cyan-700">
                  <strong>Tip:</strong> The system recognizes patterns like "First Name" → Text Input,
                  "State" → State Select, "Have you ever..." → Yes/No Radio, etc.
                </p>
              </div>
            </div>
          )}

          {genMode === 'fields' && step === 'review' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Review detected fields. You can change types or remove items before generating.
              </p>

              {/* Detected Fields */}
              <div className="space-y-2 max-h-80 overflow-auto">
                {detectedFields.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">No fields detected. Try different text.</p>
                ) : (
                  detectedFields.map((field, index) => (
                    <div key={index} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg p-3">
                      <span className="text-sm text-slate-800 flex-1">{field.label}</span>
                      <span className={`text-[10px] font-medium ${getConfidenceColor(field.confidence)}`}>
                        {field.confidence}
                      </span>
                      <select
                        value={field.type}
                        onChange={(e) => updateFieldType(index, e.target.value as QuestionType)}
                        className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="char">Text Input</option>
                        <option value="text">Text Area</option>
                        <option value="radio">Yes/No Radio</option>
                        <option value="select">Dropdown</option>
                        <option value="date">Date</option>
                        <option value="state">State Select</option>
                        <option value="country">Country Select</option>
                        <option value="zip">ZIP Code</option>
                        <option value="ssn">SSN</option>
                        <option value="signature">Signature</option>
                        <option value="lawschool">Law School</option>
                      </select>
                      <button
                        onClick={() => removeField(index)}
                        className="p-1 hover:bg-red-100 rounded"
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {detectedFields.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-700">
                    <strong>Note:</strong> {detectedFields.length} fields will be added to the selected node.
                    Make sure you have a subsection or entity selected.
                  </p>
                </div>
              )}
            </div>
          )}

          {genMode === 'ai' && aiStep === 'input' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Describe the form and/or attach the ticket&apos;s PDF or Word document. The AI will build it into the
                currently open form (<span className="font-medium text-slate-800">{form?.title}</span>) — read the
                source, edit and validate as it goes, and self-correct on errors. You&apos;ll review a diff and a
                list of anything it wasn&apos;t certain about before anything is applied.
              </p>
              <textarea
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder={`Describe the form to build, e.g.:\n\nBuild a character and fitness questionnaire with sections for personal info, education history, and prior discipline.\n\n(Or just attach the spec's PDF/Word doc below and leave this blank.)`}
                className="w-full h-40 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-800 placeholder-slate-400 resize-none font-mono"
              />

              {aiAttachment ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <FileText className="w-4 h-4 shrink-0 text-slate-500" />
                  <span className="flex-1 truncate text-sm text-slate-700">{aiAttachment.name}</span>
                  <button onClick={() => setAiAttachment(null)} className="p-1 hover:bg-slate-200 rounded">
                    <X className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-cyan-400 hover:bg-cyan-50/30">
                  <Paperclip className="w-4 h-4" />
                  Attach spec PDF or Word doc (optional)
                  <input ref={aiFileInputRef} type="file" accept=".pdf,.docx" onChange={handleAiFileChange} className="hidden" />
                </label>
              )}

              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                <p className="text-xs text-cyan-700">
                  <strong>Tip:</strong> This works best on a freshly created, empty form (File &gt; New). It supports
                  real structure — sections, conditional follow-ups, entities — not just a flat field list.
                </p>
              </div>
            </div>
          )}

          {genMode === 'ai' && aiStep === 'running' && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 py-6 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
              <p className="text-center text-sm">
                {aiProgress?.label || 'Starting…'}
                {aiElapsedSec >= 3 ? ` — ${aiElapsedSec}s elapsed` : ''}
              </p>

              {aiProgress && (
                <div className="w-full max-w-sm">
                  <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                    <span>Turn {aiProgress.turn} of up to {aiProgress.maxTurns}</span>
                    <span>{aiProgress.editsApplied} edit(s) applied</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all"
                      style={{ width: `${Math.min(100, (aiProgress.turn / aiProgress.maxTurns) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    A bound, not an ETA — it can finish well before the last turn.
                  </p>
                </div>
              )}

              {aiProgressLog.length > 0 && (
                <div className="max-h-32 w-full max-w-sm overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-500">
                  {aiProgressLog.map((line, i) => (
                    <div key={i} className={i === aiProgressLog.length - 1 ? 'font-medium text-slate-700' : ''}>
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {aiElapsedSec >= 45 && (
                <p className="max-w-sm text-center text-xs text-slate-400">
                  A full document can take a few minutes — it&apos;s reading and building one section at a time.
                  Still working; you can cancel below if needed.
                </p>
              )}
            </div>
          )}

          {genMode === 'ai' && aiStep === 'error' && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{aiErrorMsg}</span>
            </div>
          )}

          {genMode === 'ai' && aiStep === 'review' && aiResult && (
            <div className="space-y-4">
              {!aiResult.ok && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Did not finish — {aiResult.edits.length > 0 ? `${aiResult.edits.length} edit(s) were applied before it stopped` : 'no edits were applied'}.</p>
                    <p className="mt-1 text-amber-700">{aiResult.error || 'The agent stopped before completing the document.'}</p>
                    <p className="mt-1 text-amber-700">
                      {aiResult.edits.length > 0
                        ? 'Review what it managed to build below. You can Accept the partial progress and run Generate again for the rest, or Discard and try a shorter/clearer instruction.'
                        : 'Nothing was built — it may help to split the document into smaller, more specific instructions.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{aiResult.summary}</p>
              </div>

              {aiResult.uncertainties.length > 0 ? (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                    <HelpCircle className="w-4 h-4" /> Not certain about this ({aiResult.uncertainties.length}) — review before accepting
                  </h3>
                  <ul className="space-y-1.5 text-sm text-amber-800">
                    {aiResult.uncertainties.map((u, i) => (
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

              {aiHasErrors ? (
                <div className="rounded-lg border border-red-200 bg-white p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
                    <AlertCircle className="w-4 h-4" /> Validation errors ({aiResult.finalValidation.errors.length}) — do not accept
                  </h3>
                  <div className="max-h-40 space-y-1 overflow-auto text-xs text-red-600">
                    {aiResult.finalValidation.errors.map((e, i) => <div key={i}>● {e.message}</div>)}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                  <CheckCircle2 className="w-4 h-4" /> No validation errors.
                </div>
              )}

              {aiResult.finalValidation.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5" /> Warnings ({aiResult.finalValidation.warnings.length})
                  </h3>
                  <div className="max-h-32 space-y-1 overflow-auto text-xs text-amber-600">
                    {aiResult.finalValidation.warnings.map((w, i) => <div key={i}>▲ {w.message}</div>)}
                  </div>
                </div>
              )}

              {!aiResult.roundtripOk && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  Round-trip check found differences after re-parsing the AI&apos;s XML — review the diff carefully.
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Diff — original vs AI-generated{' '}
                  <span className="text-xs font-normal text-slate-400">
                    (<span className="text-green-600">+{aiDiffCounts.add}</span> <span className="text-red-600">-{aiDiffCounts.del}</span>)
                  </span>
                </h3>
                {aiResult.scopeDiffText.trim() ? (
                  <DiffView diff={aiResult.scopeDiffText} />
                ) : (
                  <p className="text-sm text-slate-400">No changes were made.</p>
                )}
              </div>

              {aiResult.edits.length > 0 && (
                <details className="rounded-lg border border-slate-200 bg-white p-3">
                  <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <ListChecks className="w-3.5 h-3.5" /> {aiResult.edits.length} edit(s) applied
                  </summary>
                  <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                    {aiResult.edits.map((e, i) => (
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
          {genMode === 'fields' && step === 'review' && (
            <button onClick={() => setStep('input')} className="btn btn-ghost">
              Back
            </button>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button onClick={handleClose} className="btn btn-ghost">
              {(genMode === 'ai' && aiStep === 'review') ? 'Discard' : 'Cancel'}
            </button>
            {genMode === 'fields' && step === 'input' && (
              <button
                onClick={handleAnalyze}
                disabled={!inputText.trim()}
                className="btn btn-primary disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                Analyze
              </button>
            )}
            {genMode === 'fields' && step === 'review' && (
              <button
                onClick={handleGenerate}
                disabled={detectedFields.length === 0}
                className="btn btn-primary disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4" />
                Generate {detectedFields.length} Fields
              </button>
            )}
            {genMode === 'ai' && aiStep === 'input' && (
              <button
                onClick={handleAiRun}
                disabled={(!aiInstruction.trim() && !aiAttachment) || !form}
                className="btn btn-primary disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                Generate
              </button>
            )}
            {genMode === 'ai' && aiStep === 'error' && (
              <button onClick={() => setAiStep('input')} className="btn btn-primary">
                Back
              </button>
            )}
            {genMode === 'ai' && aiStep === 'review' && (
              <button
                onClick={handleAiAccept}
                disabled={aiHasErrors || !aiResult?.parseOk}
                className="btn btn-primary disabled:opacity-50"
                title={aiHasErrors ? 'Fix the validation errors before applying' : undefined}
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
