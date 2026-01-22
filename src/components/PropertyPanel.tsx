'use client';

import { useFormStore } from '@/stores/formStore';
import {
  FormNode,
  FormQuestion,
  FormEntity,
  FormConditionSet,
  FormSection,
  FormSubSection,
  FormOption,
  FormDescription,
  QUESTION_TYPE_META,
  CONDITION_OPERATORS,
  PROFILE_REFERENCE_FIELDS,
  QuestionType,
} from '@/types/form';
import { Plus, Trash2, GripVertical } from 'lucide-react';

export const PropertyPanel: React.FC = () => {
  const { selectedNodeId, findNodeById } = useFormStore();

  const node = selectedNodeId ? findNodeById(selectedNodeId) : null;

  if (!node) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-slate-400">
        <p className="text-sm">Select a node to edit its properties</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-sm font-semibold text-slate-800 capitalize">{node.nodeType}</h2>
        <p className="text-xs text-slate-400 mt-1 font-mono">ID: {node.id}</p>
      </div>

      {/* Properties based on node type */}
      {node.nodeType === 'questionnaire' && <QuestionnaireProps node={node as FormNode & { title: string }} />}
      {node.nodeType === 'section' && <SectionProps node={node as FormSection} />}
      {node.nodeType === 'subsection' && <SubSectionProps node={node as FormSubSection} />}
      {node.nodeType === 'question' && <QuestionProps node={node as FormQuestion} />}
      {node.nodeType === 'entity' && <EntityProps node={node as FormEntity} />}
      {node.nodeType === 'conditionset' && <ConditionSetProps node={node as FormConditionSet} />}
    </div>
  );
};

// Questionnaire Properties
const QuestionnaireProps: React.FC<{ node: FormNode & { title: string; suffix?: string } }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Title">
        <input
          type="text"
          value={node.title}
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
          className="w-full"
        />
      </Field>
      <Field label="Suffix">
        <input
          type="text"
          value={node.suffix || ''}
          onChange={(e) => updateNode(node.id, { suffix: e.target.value })}
          className="w-full"
        />
      </Field>
    </div>
  );
};

// Section Properties
const SectionProps: React.FC<{ node: FormSection }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Title">
        <input
          type="text"
          value={node.title}
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
          className="w-full"
        />
      </Field>
      <Field label="Show in Bar Admin">
        <ToggleSwitch
          checked={node.showInBarAdmin}
          onChange={(checked) => updateNode(node.id, { showInBarAdmin: checked })}
        />
      </Field>
    </div>
  );
};

// SubSection Properties
const SubSectionProps: React.FC<{ node: FormSubSection }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Title">
        <input
          type="text"
          value={node.title}
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
          className="w-full"
        />
      </Field>
      <Field label="Show in Bar Admin">
        <ToggleSwitch
          checked={node.showInBarAdmin}
          onChange={(checked) => updateNode(node.id, { showInBarAdmin: checked })}
        />
      </Field>
    </div>
  );
};

// Question Properties
const QuestionProps: React.FC<{ node: FormQuestion }> = ({ node }) => {
  const { updateNode, generateId } = useFormStore();

  const typeMeta = QUESTION_TYPE_META.find((t) => t.type === node.type);
  const description = node.children.find((c) => c.nodeType === 'description') as FormDescription | undefined;
  const options = node.children.filter((c) => c.nodeType === 'option') as FormOption[];

  const updateDescription = (text: string) => {
    const newChildren = node.children.map((c) =>
      c.nodeType === 'description' ? { ...c, text } : c
    ) as FormQuestion['children'];
    updateNode(node.id, { children: newChildren } as Partial<FormQuestion>);
  };

  const updateDescriptionPrefix = (prefix: string) => {
    const newChildren = node.children.map((c) =>
      c.nodeType === 'description' ? { ...c, prefix } : c
    ) as FormQuestion['children'];
    updateNode(node.id, { children: newChildren } as Partial<FormQuestion>);
  };

  const addOption = () => {
    const newOption: FormOption = {
      id: generateId(),
      nodeType: 'option',
      value: '',
      text: 'New Option',
    };
    updateNode(node.id, { children: [...node.children, newOption] } as Partial<FormQuestion>);
  };

  const updateOption = (optionId: string, updates: Partial<FormOption>) => {
    const newChildren = node.children.map((c) =>
      c.id === optionId ? { ...c, ...updates } : c
    ) as FormQuestion['children'];
    updateNode(node.id, { children: newChildren } as Partial<FormQuestion>);
  };

  const deleteOption = (optionId: string) => {
    const newChildren = node.children.filter((c) => c.id !== optionId) as FormQuestion['children'];
    updateNode(node.id, { children: newChildren } as Partial<FormQuestion>);
  };

  return (
    <div className="space-y-4">
      {/* Question Type */}
      <Field label="Type">
        <select
          value={node.type}
          onChange={(e) => updateNode(node.id, { type: e.target.value as QuestionType })}
          className="w-full"
        >
          {QUESTION_TYPE_META.map((meta) => (
            <option key={meta.type} value={meta.type}>
              {meta.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Description */}
      <Field label="Question Text">
        <textarea
          value={description?.text || ''}
          onChange={(e) => updateDescription(e.target.value)}
          className="w-full h-20 resize-none"
          placeholder="Enter question text..."
        />
      </Field>

      {/* Prefix */}
      <Field label="Prefix">
        <input
          type="text"
          value={description?.prefix || ''}
          onChange={(e) => updateDescriptionPrefix(e.target.value)}
          className="w-full"
          placeholder="e.g., 1. or a)"
        />
      </Field>

      {/* Format (if applicable) */}
      {typeMeta?.hasFormat && typeMeta.formats && node.type !== 'profilereference' && (
        <Field label="Format">
          <select
            value={node.format}
            onChange={(e) => updateNode(node.id, { format: e.target.value })}
            className="w-full"
          >
            {typeMeta.formats.map((format) => (
              <option key={format || 'default'} value={format}>
                {format || '(default)'}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Profile Reference Field (grouped dropdown) */}
      {node.type === 'profilereference' && (
        <Field label="Reference Field">
          <select
            value={node.format}
            onChange={(e) => updateNode(node.id, { format: e.target.value })}
            className="w-full"
          >
            <option value="">Select a field...</option>
            {Object.entries(
              PROFILE_REFERENCE_FIELDS.reduce((acc, field) => {
                if (!acc[field.category]) acc[field.category] = [];
                acc[field.category].push(field);
                return acc;
              }, {} as Record<string, typeof PROFILE_REFERENCE_FIELDS>)
            ).map(([category, fields]) => (
              <optgroup key={category} label={category}>
                {fields.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}

      {/* Required */}
      <Field label="Required">
        <ToggleSwitch
          checked={node.required}
          onChange={(checked) => updateNode(node.id, { required: checked })}
        />
      </Field>

      {/* Trigger Value */}
      <Field label="Trigger Value" hint="Value that triggers conditional content">
        <input
          type="text"
          value={node.triggerValue}
          onChange={(e) => updateNode(node.id, { triggerValue: e.target.value })}
          className="w-full"
          placeholder="e.g., yes, no"
        />
      </Field>

      {/* Options (for radio/select) */}
      {typeMeta?.hasOptions && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">Options ({options.length})</label>
            <button onClick={addOption} className="text-xs text-cyan-600 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Option
            </button>
          </div>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={option.id} className="bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-100">
                {/* Option Header with ID */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3 h-3 text-slate-400 cursor-move" />
                    <span className="text-[10px] text-slate-500 font-medium">#{index + 1}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-cyan-600 font-mono bg-cyan-50 px-1.5 py-0.5 rounded">ID: {option.id}</span>
                    <button
                      onClick={() => deleteOption(option.id)}
                      className="p-1 hover:bg-red-100 rounded"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </button>
                  </div>
                </div>
                {/* Option Fields */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500 block mb-1">Value</label>
                    <input
                      type="text"
                      value={option.value}
                      onChange={(e) => updateOption(option.id, { value: e.target.value })}
                      className="w-full text-xs"
                      placeholder="value"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500 block mb-1">Label</label>
                    <input
                      type="text"
                      value={option.text}
                      onChange={(e) => updateOption(option.id, { text: e.target.value })}
                      className="w-full text-xs"
                      placeholder="label"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {options.length === 0 && (
            <p className="text-xs text-slate-400 italic">No options yet. Click "Add Option" to create one.</p>
          )}
        </div>
      )}

      {/* Max Length (for text types) */}
      {(node.type === 'char' || node.type === 'text') && (
        <Field label="Max Length">
          <input
            type="number"
            value={node.maxlength}
            onChange={(e) => updateNode(node.id, { maxlength: parseInt(e.target.value) || 0 })}
            className="w-full"
          />
        </Field>
      )}

      {/* Comment */}
      <Field label="Comment" hint="Help text shown to user">
        <input
          type="text"
          value={node.comment}
          onChange={(e) => updateNode(node.id, { comment: e.target.value })}
          className="w-full"
        />
      </Field>

      {/* Advanced Section */}
      <details className="mt-6">
        <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700">
          Advanced Options
        </summary>
        <div className="mt-4 space-y-4 pl-3 border-l-2 border-slate-100">
          <Field label="Ref Name">
            <input
              type="text"
              value={node.refname}
              onChange={(e) => updateNode(node.id, { refname: e.target.value })}
              className="w-full"
            />
          </Field>
          <Field label="App Type">
            <input
              type="text"
              value={node.appType}
              onChange={(e) => updateNode(node.id, { appType: e.target.value })}
              className="w-full"
            />
          </Field>
          <Field label="NCBE Name">
            <input
              type="text"
              value={node.ncbeName}
              onChange={(e) => updateNode(node.id, { ncbeName: e.target.value })}
              className="w-full"
            />
          </Field>
          <Field label="Validator Class">
            <input
              type="text"
              value={node.validatorClass}
              onChange={(e) => updateNode(node.id, { validatorClass: e.target.value })}
              className="w-full"
            />
          </Field>
        </div>
      </details>
    </div>
  );
};

// Entity Properties
const EntityProps: React.FC<{ node: FormEntity }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Title">
        <input
          type="text"
          value={node.title}
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
          className="w-full"
        />
      </Field>
      <Field label="Type">
        <select
          value={node.type}
          onChange={(e) => updateNode(node.id, { type: e.target.value as 'single' | 'addmore' })}
          className="w-full"
        >
          <option value="single">Single</option>
          <option value="addmore">Add More (Repeatable)</option>
        </select>
      </Field>
      {node.type === 'addmore' && (
        <>
          <Field label="Minimum">
            <input
              type="number"
              value={node.min}
              onChange={(e) => updateNode(node.id, { min: parseInt(e.target.value) || 0 })}
              className="w-full"
            />
          </Field>
          <Field label="Maximum">
            <input
              type="number"
              value={node.max}
              onChange={(e) => updateNode(node.id, { max: parseInt(e.target.value) || 0 })}
              className="w-full"
            />
          </Field>
        </>
      )}
      <Field label="Show in Bar Admin">
        <ToggleSwitch
          checked={node.showInBarAdmin}
          onChange={(checked) => updateNode(node.id, { showInBarAdmin: checked })}
        />
      </Field>

      <details className="mt-6">
        <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700">
          NCBE/ILG Export
        </summary>
        <div className="mt-4 space-y-4 pl-3 border-l-2 border-slate-100">
          <Field label="NCBE Name">
            <input
              type="text"
              value={node.ncbeName}
              onChange={(e) => updateNode(node.id, { ncbeName: e.target.value })}
              className="w-full"
            />
          </Field>
          <Field label="NCBE Value">
            <input
              type="text"
              value={node.ncbeValue}
              onChange={(e) => updateNode(node.id, { ncbeValue: e.target.value })}
              className="w-full"
            />
          </Field>
          <Field label="ILG Name">
            <input
              type="text"
              value={node.ilgName}
              onChange={(e) => updateNode(node.id, { ilgName: e.target.value })}
              className="w-full"
            />
          </Field>
        </div>
      </details>
    </div>
  );
};

// ConditionSet Properties
const ConditionSetProps: React.FC<{ node: FormConditionSet }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Operator" hint="How conditions are evaluated">
        <select
          value={node.operator}
          onChange={(e) => updateNode(node.id, { operator: e.target.value as FormConditionSet['operator'] })}
          className="w-full"
        >
          {CONDITION_OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label} - {op.description}
            </option>
          ))}
        </select>
      </Field>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-700">
          <strong>Tip:</strong> Add questions with trigger values inside this condition set, then add a conditional branch to show content when conditions are met.
        </p>
      </div>
    </div>
  );
};

// Helper Components
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-cyan-500' : 'bg-slate-200'}`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);
