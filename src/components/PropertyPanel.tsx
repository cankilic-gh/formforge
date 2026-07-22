'use client';

import { useFormStore } from '@/stores/formStore';
import {
  FormNode,
  FormQuestion,
  FormEntity,
  FormConditionSet,
  FormConditionLogic,
  FormConditional,
  FormSection,
  FormSubSection,
  FormSubform,
  FormOption,
  FormDescription,
  FormWarning,
  FormNote,
  FormIncludeForm,
  FormRequiredDocument,
  FormSimpleText,
  FormValidator,
  FormUnknown,
  QUESTION_TYPE_META,
  CONDITION_OPERATORS,
  PROFILE_REFERENCE_FIELDS,
  QuestionType,
} from '@/types/form';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { RichTextEditor } from './RichTextEditor';

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
      {node.nodeType === 'subform' && <SubformProps node={node as FormSubform} />}
      {node.nodeType === 'section' && <SectionProps node={node as FormSection} />}
      {node.nodeType === 'subsection' && <SubSectionProps node={node as FormSubSection} />}
      {node.nodeType === 'question' && <QuestionProps node={node as FormQuestion} />}
      {node.nodeType === 'entity' && <EntityProps node={node as FormEntity} />}
      {node.nodeType === 'conditionset' && <ConditionSetProps node={node as FormConditionSet} />}
      {node.nodeType === 'conditionlogic' && <ConditionLogicProps node={node as FormConditionLogic} />}
      {node.nodeType === 'conditional' && <ConditionalProps node={node as FormConditional} />}
      {node.nodeType === 'description' && <DescriptionProps node={node as FormDescription} />}
      {node.nodeType === 'warning' && <WarningProps node={node as FormWarning} />}
      {node.nodeType === 'note' && <NoteProps node={node as FormNote} />}
      {node.nodeType === 'includeform' && <IncludeFormProps node={node as FormIncludeForm} />}
      {node.nodeType === 'required-doc' && <RequiredDocProps node={node as FormRequiredDocument} />}
      {node.nodeType === 'simpletext' && <SimpleTextProps node={node as FormSimpleText} />}
      {node.nodeType === 'validator' && <ValidatorProps node={node as FormValidator} />}
      {node.nodeType === 'unknown' && <UnknownProps node={node as FormUnknown} />}
    </div>
  );
};

// Questionnaire Properties
const QuestionnaireProps: React.FC<{ node: FormNode & { title: string; suffix?: string; nextId?: number } }> = ({ node }) => {
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
      <Field label="Next ID">
        <input
          type="number"
          min={1}
          value={node.nextId ?? ''}
          onChange={(e) => updateNode(node.id, { nextId: parseInt(e.target.value, 10) || 1 })}
          className="w-full"
        />
      </Field>
    </div>
  );
};

// Subform Properties
const SubformProps: React.FC<{ node: FormSubform }> = ({ node }) => {
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
      <Field label="Next ID">
        <input
          type="number"
          min={1}
          value={node.nextId ?? ''}
          onChange={(e) => updateNode(node.id, { nextId: parseInt(e.target.value, 10) || 1 })}
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
          checked={node.showInBarAdmin ?? false}
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
          checked={node.showInBarAdmin ?? false}
          onChange={(checked) => updateNode(node.id, { showInBarAdmin: checked })}
        />
      </Field>
      <details className="mt-6">
        <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700">
          Conditional Display
        </summary>
        <div className="mt-4 space-y-4 pl-3 border-l-2 border-slate-100">
          <Field label="Depends On" hint="ID of a conditionset/conditionlogic that controls this subsection">
            <input
              type="text"
              value={node.depends || ''}
              onChange={(e) => updateNode(node.id, { depends: e.target.value || undefined })}
              className="w-full"
            />
          </Field>
          <Field label="Condition Value" hint="Show when the evaluation equals this value (true/false)">
            <input
              type="text"
              value={node.condition || ''}
              onChange={(e) => updateNode(node.id, { condition: e.target.value || undefined })}
              className="w-full"
            />
          </Field>
        </div>
      </details>
    </div>
  );
};

// Question Properties
const QuestionProps: React.FC<{ node: FormQuestion }> = ({ node }) => {
  const { updateNode, generateId } = useFormStore();

  const typeMeta = QUESTION_TYPE_META.find((t) => t.type === node.type);
  const description = node.children.find((c) => c.nodeType === 'description') as FormDescription | undefined;
  const options = node.children.filter((c) => c.nodeType === 'option') as FormOption[];
  const reference = node.children.find((c) => c.nodeType === 'reference') as { field?: string } | undefined;

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

  const updateReferenceField = (field: string) => {
    // If reference child exists, update it; otherwise create one
    const hasReference = node.children.some((c) => c.nodeType === 'reference');
    if (hasReference) {
      const newChildren = node.children.map((c) =>
        c.nodeType === 'reference' ? { ...c, field } : c
      ) as FormQuestion['children'];
      updateNode(node.id, { children: newChildren } as Partial<FormQuestion>);
    } else {
      const newReference = {
        id: generateId(),
        nodeType: 'reference' as const,
        table: 'profile',
        field,
      };
      const newChildren = [...node.children, newReference] as FormQuestion['children'];
      updateNode(node.id, { children: newChildren } as Partial<FormQuestion>);
    }
  };

  // Get reference field value - prefer child reference, fall back to format
  const referenceFieldValue = reference?.field || node.format || '';

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
        <RichTextEditor
          value={description?.text || ''}
          onChange={(html) => updateDescription(html)}
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
        <Field label="Reference Field" hint="Profile data to auto-fill">
          <select
            value={referenceFieldValue}
            onChange={(e) => updateReferenceField(e.target.value)}
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

// Description Properties (standalone)
const DescriptionProps: React.FC<{ node: FormDescription }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Prefix">
        <input
          type="text"
          value={node.prefix || ''}
          onChange={(e) => updateNode(node.id, { prefix: e.target.value })}
          className="w-full"
          placeholder="e.g., 1. or a)"
        />
      </Field>
      <Field label="Text">
        <RichTextEditor
          value={node.text || ''}
          onChange={(html) => updateNode(node.id, { text: html })}
          placeholder="Enter description text..."
        />
      </Field>
    </div>
  );
};

// Warning Properties
const WarningProps: React.FC<{ node: FormWarning }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Text">
        <RichTextEditor
          value={node.text || ''}
          onChange={(html) => updateNode(node.id, { text: html })}
          placeholder="Enter warning text..."
        />
      </Field>
      <Field label="Prevent Submit" hint="Blocks application submission while this warning is active">
        <ToggleSwitch
          checked={node.preventSubmit ?? false}
          onChange={(checked) => updateNode(node.id, { preventSubmit: checked })}
        />
      </Field>
    </div>
  );
};

// Note Properties
const NoteProps: React.FC<{ node: FormNote }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Prefix">
        <input
          type="text"
          value={node.prefix || ''}
          onChange={(e) => updateNode(node.id, { prefix: e.target.value })}
          className="w-full"
          placeholder="e.g., NOTE:"
        />
      </Field>
      <Field label="Text">
        <RichTextEditor
          value={node.text || ''}
          onChange={(html) => updateNode(node.id, { text: html })}
          placeholder="Enter note text..."
        />
      </Field>
      <Field label="Is Check Item">
        <ToggleSwitch
          checked={node.isCheckItem ?? false}
          onChange={(checked) => updateNode(node.id, { isCheckItem: checked })}
        />
      </Field>
    </div>
  );
};

// SimpleText Properties - raw HTML fragment, E-Bar renders it verbatim (template is just %s)
const SimpleTextProps: React.FC<{ node: FormSimpleText }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Raw HTML" hint="Rendered verbatim by E-Bar with no wrapper markup">
        <RichTextEditor
          value={node.text || ''}
          onChange={(html) => updateNode(node.id, { text: html })}
          placeholder="Enter raw HTML fragment..."
        />
      </Field>
    </div>
  );
};

// Validator Properties
const ValidatorProps: React.FC<{ node: FormValidator }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Validator Class" hint="Fully-qualified Java class, e.g. ilg.ebar.forms.validators.EmpDateGapValidator">
        <input
          type="text"
          value={node.validatorClass || ''}
          onChange={(e) => updateNode(node.id, { validatorClass: e.target.value })}
          className="w-full font-mono text-xs"
        />
      </Field>
    </div>
  );
};

// Unknown Properties - read-only, preserved verbatim on export
const UnknownProps: React.FC<{ node: FormUnknown }> = ({ node }) => (
  <div className="space-y-4">
    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      FormForge does not model <code className="font-mono">&lt;{node.tagName}&gt;</code> yet.
      The element is preserved exactly as-is and will be re-emitted verbatim on save.
    </div>
  </div>
);

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
          onChange={(e) => updateNode(node.id, { type: e.target.value as FormEntity['type'] })}
          className="w-full"
        >
          <option value="single">Single</option>
          <option value="addmore">Add More (Repeatable)</option>
          <option value="maingroup">Main Group</option>
          <option value="subgroup">Sub Group</option>
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
          checked={node.showInBarAdmin ?? false}
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

// ConditionLogic Properties
const ConditionLogicProps: React.FC<{ node: FormConditionLogic }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Operator" hint="How conditions are evaluated">
        <select
          value={node.operator}
          onChange={(e) => updateNode(node.id, { operator: e.target.value as FormConditionLogic['operator'] })}
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
          <strong>Condition Logic:</strong> This contains conditions that determine when the nested content is shown based on question values.
        </p>
      </div>

      {node.conditions && node.conditions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">Conditions:</p>
          {node.conditions.map((cond, idx) => (
            <div key={cond.id} className="p-2 bg-slate-50 rounded text-xs font-mono">
              {idx > 0 && <span className="text-amber-600">{node.operator.toUpperCase()} </span>}
              <span className="text-slate-700">Q({cond.questionId})</span>
              <span className="text-slate-500"> = </span>
              <span className="text-green-600">&quot;{cond.value}&quot;</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Conditional Properties
const ConditionalProps: React.FC<{ node: FormConditional }> = ({ node }) => {
  const { updateNode } = useFormStore();

  // Check if it's a simple true/false or a switch condition (undefined means not set yet, treat as simple)
  const isSimpleCondition = node.condition === undefined || node.condition === 'true' || node.condition === 'false';

  return (
    <div className="space-y-4">
      <Field label="Condition Type">
        <select
          value={isSimpleCondition ? 'simple' : 'switch'}
          onChange={(e) => {
            if (e.target.value === 'simple') {
              updateNode(node.id, { condition: 'true' });
            } else {
              updateNode(node.id, { condition: ';value1;value2;' });
            }
          }}
          className="w-full"
        >
          <option value="simple">Simple (true/false)</option>
          <option value="switch">Switch (multiple values)</option>
        </select>
      </Field>

      {isSimpleCondition ? (
        <Field label="Condition" hint="When should this branch be shown?">
          <div className="flex gap-2">
            <button
              onClick={() => updateNode(node.id, { condition: 'true' })}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                node.condition === 'true'
                  ? 'bg-green-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              True
            </button>
            <button
              onClick={() => updateNode(node.id, { condition: 'false' })}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                node.condition === 'false'
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              False
            </button>
          </div>
        </Field>
      ) : (
        <Field label="Switch Values" hint="Values that trigger this branch (e.g., ;value1;value2;)">
          <input
            type="text"
            value={node.condition || ''}
            onChange={(e) => updateNode(node.id, { condition: e.target.value })}
            className="w-full"
            placeholder=";value1;value2;"
          />
        </Field>
      )}

      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
        <p className="text-xs text-purple-700">
          <strong>Conditional Branch:</strong> Content inside this branch will only be shown when the parent condition set evaluates to this condition value.
        </p>
      </div>
    </div>
  );
};

// IncludeForm Properties
const IncludeFormProps: React.FC<{ node: FormIncludeForm }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Form Name" hint="XML file name (e.g., affirmation.xml)">
        <input
          type="text"
          value={node.formName}
          onChange={(e) => updateNode(node.id, { formName: e.target.value })}
          className="w-full"
          placeholder="form_name.xml"
        />
      </Field>
      <Field label="Title" hint="Display title for the form">
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
          onChange={(e) => updateNode(node.id, { type: e.target.value })}
          className="w-full"
        >
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="attachment">Attachment</option>
        </select>
      </Field>
      <Field label="Multiple Include">
        <ToggleSwitch
          checked={node.multipleInclude}
          onChange={(checked) => updateNode(node.id, { multipleInclude: checked })}
        />
      </Field>
      <Field label="Required">
        <ToggleSwitch
          checked={node.required}
          onChange={(checked) => updateNode(node.id, { required: checked })}
        />
      </Field>

      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
        <p className="text-xs text-indigo-700">
          <strong>Include Form</strong> embeds another XML form into this section. The applicant will complete the included form as part of this application.
        </p>
      </div>
    </div>
  );
};

// RequiredDocument Properties
const RequiredDocProps: React.FC<{ node: FormRequiredDocument }> = ({ node }) => {
  const { updateNode } = useFormStore();

  return (
    <div className="space-y-4">
      <Field label="Title" hint="Document name shown to applicant">
        <input
          type="text"
          value={node.title}
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
          className="w-full"
          placeholder="e.g., Photo ID, Transcript"
        />
      </Field>
      <Field label="Prevent Submit" hint="Block submission if document is missing">
        <ToggleSwitch
          checked={node.preventSubmit}
          onChange={(checked) => updateNode(node.id, { preventSubmit: checked })}
        />
      </Field>

      <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-xs text-orange-700">
          <strong>Required Document</strong> prompts the applicant to upload a specific document. If "Prevent Submit" is enabled, the application cannot be submitted without this document.
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
