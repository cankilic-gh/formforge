'use client';

import { useState } from 'react';
import { useFormStore } from '@/stores/formStore';
import { useModal } from '@/components/Modal';
import { X, Wand2, FileText, Upload } from 'lucide-react';
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

export const SmartFormGenerator: React.FC<SmartFormGeneratorProps> = ({ isOpen, onClose }) => {
  const [inputText, setInputText] = useState('');
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [step, setStep] = useState<'input' | 'review'>('input');
  const { form, selectedNodeId, findNodeById, addQuestionWithText, saveToHistory } = useFormStore();
  const { showAlert } = useModal();

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

    // Reset and close
    setInputText('');
    setDetectedFields([]);
    setStep('input');
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setInputText(text);
    };
    reader.readAsText(file);
    e.target.value = '';
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-cyan-600" />
            <h2 className="text-lg font-semibold text-slate-800">Smart Form Generator</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {step === 'input' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Paste form field labels or upload a document. The system will automatically detect field types.
              </p>

              {/* File Upload */}
              <div className="flex items-center gap-2">
                <label className="btn btn-ghost cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Upload File</span>
                  <input
                    type="file"
                    accept=".txt,.doc,.docx"
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
          ) : (
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50">
          {step === 'review' && (
            <button
              onClick={() => setStep('input')}
              className="btn btn-ghost"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            {step === 'input' ? (
              <button
                onClick={handleAnalyze}
                disabled={!inputText.trim()}
                className="btn btn-primary disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                Analyze
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={detectedFields.length === 0}
                className="btn btn-primary disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4" />
                Generate {detectedFields.length} Fields
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
