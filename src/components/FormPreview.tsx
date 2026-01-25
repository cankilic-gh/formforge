'use client';

import { useState, useMemo, createContext, useContext, useCallback } from 'react';
import { useFormStore } from '@/stores/formStore';
import {
  FormNode,
  FormQuestion,
  FormEntity,
  FormConditionSet,
  FormConditional,
  FormSection,
  FormSubSection,
  FormDescription,
  FormOption,
  FormWarning,
  FormNote,
} from '@/types/form';
import { US_STATES, COUNTRIES, MONTHS, generateYears } from '@/lib/formData';

interface SubsectionOption {
  id: string;
  title: string;
  sectionId: string;
  sectionTitle: string;
}

// Context for preview answers (conditional logic)
interface PreviewContextType {
  answers: Record<string, string>;
  setAnswer: (questionId: string, value: string) => void;
}

const PreviewContext = createContext<PreviewContextType>({
  answers: {},
  setAnswer: () => {},
});

const usePreviewContext = () => useContext(PreviewContext);

export const FormPreview: React.FC = () => {
  const { form } = useFormStore();
  const [selectedSubsectionId, setSelectedSubsectionId] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const setAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  // Derive subsection list grouped by section
  const subsectionOptions = useMemo<SubsectionOption[]>(() => {
    if (!form) return [];
    return form.children.flatMap((section) =>
      section.children.map((subsection) => ({
        id: subsection.id,
        title: subsection.title,
        sectionId: section.id,
        sectionTitle: section.title,
      }))
    );
  }, [form]);

  // Group subsections by section for optgroup
  const groupedSubsections = useMemo(() => {
    const groups: Record<string, SubsectionOption[]> = {};
    subsectionOptions.forEach((opt) => {
      if (!groups[opt.sectionTitle]) {
        groups[opt.sectionTitle] = [];
      }
      groups[opt.sectionTitle].push(opt);
    });
    return groups;
  }, [subsectionOptions]);

  // Filter sections based on selection
  const filteredSections = useMemo(() => {
    if (!form) return [];
    if (!selectedSubsectionId) return form.children;

    return form.children
      .map((section) => ({
        ...section,
        children: section.children.filter((sub) => sub.id === selectedSubsectionId),
      }))
      .filter((section) => section.children.length > 0);
  }, [form, selectedSubsectionId]);

  if (!form) return null;

  return (
    <PreviewContext.Provider value={{ answers, setAnswer }}>
      <div className="h-full overflow-auto bg-white">
        {/* Bootstrap CSS */}
        <link
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
          rel="stylesheet"
        />
        {/* Preview-specific styles */}
        <style>{`
          .preview-form *:focus {
            outline: none !important;
            box-shadow: none !important;
          }
          .preview-form .form-control:focus,
          .preview-form .form-select:focus,
          .preview-form .form-check-input:focus {
            border-color: #dee2e6 !important;
            box-shadow: none !important;
          }
          .preview-form .form-check-input {
            appearance: auto !important;
            -webkit-appearance: auto !important;
          }
          .preview-form .form-check-input[type="radio"] {
            border-radius: 50% !important;
          }
          .subsection-selector {
            background: #f8f9fa;
            border-bottom: 1px solid #dee2e6;
            padding: 1rem;
            position: sticky;
            top: 0;
            z-index: 10;
          }
          .subsection-selector select {
            min-width: 300px;
          }
          .conditional-content {
            animation: fadeIn 0.2s ease-in-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

      {/* Subsection Selector */}
      <div className="subsection-selector">
        <div className="container">
          <div className="d-flex align-items-center gap-3">
            <label htmlFor="subsection-select" className="form-label mb-0 fw-medium text-secondary">
              View:
            </label>
            <select
              id="subsection-select"
              className="form-select form-select-sm"
              value={selectedSubsectionId}
              onChange={(e) => setSelectedSubsectionId(e.target.value)}
              style={{ width: 'auto', minWidth: '300px' }}
            >
              <option value="">Show All (Full Form)</option>
              {Object.entries(groupedSubsections).map(([sectionTitle, subsections]) => (
                <optgroup key={sectionTitle} label={sectionTitle}>
                  {subsections.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedSubsectionId && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setSelectedSubsectionId('')}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="container py-4">
        {/* Form Title */}
        <h1 className="mb-4 text-center">{form.title}</h1>

        {/* Form Body */}
        <div id="formBody">
          <form name="ilgform" method="post" className="preview-form">
            <div className="ebas-form-questions mb-5" id="questions">
              {filteredSections.map((section) => (
                <SectionPreview key={section.id} section={section} />
              ))}
            </div>

            {/* Submit Buttons */}
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-light">Cancel</button>
              <button type="submit" className="btn btn-primary">Continue</button>
            </div>
          </form>
        </div>
      </div>

        {/* Bootstrap JS */}
        <script
          src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
          async
        />
      </div>
    </PreviewContext.Provider>
  );
};

// Section Preview
const SectionPreview: React.FC<{ section: FormSection }> = ({ section }) => (
  <div className="mb-5">
    <h2 className="border-bottom pb-2 mb-4">{section.title}</h2>
    {section.children.map((subsection) => (
      <SubSectionPreview key={subsection.id} subsection={subsection} />
    ))}
  </div>
);

// SubSection Preview
const SubSectionPreview: React.FC<{ subsection: FormSubSection }> = ({ subsection }) => (
  <div className="mb-4">
    <h4 className="mb-3 text-secondary">{subsection.title}</h4>
    {subsection.children.map((child) => (
      <NodePreview key={child.id} node={child} />
    ))}
  </div>
);

// Node Preview (generic)
const NodePreview: React.FC<{ node: FormNode }> = ({ node }) => {
  switch (node.nodeType) {
    case 'question':
      return <QuestionPreview question={node as FormQuestion} />;
    case 'entity':
      return <EntityPreview entity={node as FormEntity} />;
    case 'conditionset':
      return <ConditionSetPreview conditionSet={node as FormConditionSet} />;
    case 'conditional':
      return <ConditionalPreview conditional={node as FormConditional} />;
    case 'description':
      return <DescriptionPreview description={node as FormDescription} />;
    case 'warning':
      return <WarningPreview warning={node as FormWarning} />;
    case 'note':
      return <NotePreview note={node as FormNote} />;
    default:
      return null;
  }
};

// Description Preview (renders HTML tags like <strong>, <u>, <em>)
const DescriptionPreview: React.FC<{ description: FormDescription }> = ({ description }) => (
  <div className="form-row mb-2">
    <div className="qNum">{description.prefix}</div>
    <div>
      <span className="descControl" dangerouslySetInnerHTML={{ __html: description.text }} />
    </div>
  </div>
);

// Warning Preview (renders HTML tags)
const WarningPreview: React.FC<{ warning: FormWarning }> = ({ warning }) => (
  <div className="alert alert-warning mb-3" dangerouslySetInnerHTML={{ __html: warning.text }} />
);

// Note Preview (renders HTML tags)
const NotePreview: React.FC<{ note: FormNote }> = ({ note }) => (
  <div className="alert alert-info mb-3" dangerouslySetInnerHTML={{ __html: note.text }} />
);

// Question Preview
const QuestionPreview: React.FC<{ question: FormQuestion }> = ({ question }) => {
  const description = question.children.find((c) => c.nodeType === 'description') as FormDescription | undefined;
  const options = question.children.filter((c) => c.nodeType === 'option') as FormOption[];
  const isRequired = question.required;

  const shortFieldTypes = ['zip', 'ssn', 'date', 'emp_date_start', 'emp_date_end', 'res_date_start', 'res_date_end'];
  const isShortField = shortFieldTypes.includes(question.type);
  const isRadioInline = question.type === 'radio' && options.length <= 3;

  return (
    <div className="row mb-3 align-items-start">
      {/* Question Number/Prefix */}
      <div className="col-auto" style={{ width: '40px' }}>
        {description?.prefix && <span className="fw-bold">{description.prefix}</span>}
      </div>

      {/* Label (renders HTML tags like <strong>, <u>, <em>) */}
      <div className={`${isRadioInline ? 'col' : 'col-4'} ${isRequired ? 'text-danger' : ''}`}>
        <label htmlFor={question.id} className="form-label">
          <span dangerouslySetInnerHTML={{ __html: description?.text || 'Question' }} />
          {isRequired && <span className="text-danger">*</span>}
        </label>
        {question.comment && (
          <small className="d-block text-muted fst-italic" dangerouslySetInnerHTML={{ __html: question.comment }} />
        )}
      </div>

      {/* Input Control */}
      <div className={`${isRadioInline ? 'col-auto' : 'col'} ${isShortField ? 'd-flex justify-content-end' : ''}`}>
        <QuestionInput question={question} options={options} />
      </div>
    </div>
  );
};

// Question Input based on type
const QuestionInput: React.FC<{ question: FormQuestion; options: FormOption[] }> = ({ question, options }) => {
  const { type, format, id, maxlength } = question;
  const { answers, setAnswer } = usePreviewContext();
  const currentValue = answers[id] || '';

  switch (type) {
    case 'char':
      return (
        <input
          type={format === 'email' ? 'email' : 'text'}
          className="form-control form-control-sm"
          id={id}
          name={`question[${id}]`}
          maxLength={maxlength || 500}
        />
      );

    case 'text':
      return (
        <textarea
          className={`form-control form-control-sm ${format === 'large' ? 'form-control-lg' : ''}`}
          id={id}
          name={`question[${id}]`}
          rows={format === 'large' ? 6 : 3}
          maxLength={maxlength || 5000}
        />
      );

    case 'ssn':
      return (
        <input
          type="text"
          className="form-control form-control-sm"
          id={id}
          name={`question[${id}]`}
          placeholder="XXX-XX-XXXX"
          maxLength={11}
        />
      );

    case 'radio':
    case 'radioseperate':
      return (
        <div className={type === 'radioseperate' ? '' : 'd-flex gap-3 justify-content-end'}>
          {options.map((opt) => (
            <div key={opt.id} className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                id={opt.id}
                name={`question[${id}]`}
                value={opt.value}
                checked={currentValue === opt.value}
                onChange={(e) => setAnswer(id, e.target.value)}
                style={{ appearance: 'auto' }}
              />
              <label className="form-check-label" htmlFor={opt.id}>
                {opt.text}
              </label>
            </div>
          ))}
        </div>
      );

    case 'select':
      return (
        <select
          className="form-select form-select-sm"
          id={id}
          name={`question[${id}]`}
          value={currentValue}
          onChange={(e) => setAnswer(id, e.target.value)}
        >
          <option value=""></option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.value}>
              {opt.text}
            </option>
          ))}
        </select>
      );

    case 'date':
    case 'emp_date_start':
    case 'emp_date_end':
    case 'res_date_start':
    case 'res_date_end':
      return <DateInput id={id} format={format} />;

    case 'state':
    case 'state_ube':
    case 'state_mutual':
      return (
        <select className="form-select form-select-sm" id={id} name={`question[${id}]`}>
          <option value=""></option>
          {US_STATES.map((state) => (
            <option key={state.value} value={state.value}>
              {state.label}
            </option>
          ))}
        </select>
      );

    case 'country':
      return (
        <select className="form-select form-select-sm" id={id} name={`question[${id}]`}>
          <option value=""></option>
          {COUNTRIES.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      );

    case 'zip':
      return (
        <input
          type="text"
          className="form-control form-control-sm"
          id={id}
          name={`question[${id}]`}
          placeholder="ZIP Code"
          maxLength={10}
          style={{ maxWidth: '120px' }}
        />
      );

    case 'signature':
      return (
        <div className="border rounded p-3 bg-light">
          <p className="text-muted mb-2">Electronic Signature</p>
          <input
            type="text"
            className="form-control form-control-sm"
            id={id}
            name={`question[${id}]`}
            placeholder="Type your full legal name"
          />
        </div>
      );

    case 'lawschool':
      return (
        <select className="form-select form-select-sm" id={id} name={`question[${id}]`}>
          <option value="">Select Law School...</option>
          <option value="harvard">Harvard Law School</option>
          <option value="yale">Yale Law School</option>
          <option value="stanford">Stanford Law School</option>
          <option value="other">Other</option>
        </select>
      );

    default:
      return (
        <input
          type="text"
          className="form-control form-control-sm"
          id={id}
          name={`question[${id}]`}
        />
      );
  }
};

// Date Input Component
const DateInput: React.FC<{ id: string; format: string }> = ({ id, format }) => {
  const years = generateYears();
  const showDay = format.includes('dd');
  const showPresent = format.includes('present');

  return (
    <div className="d-flex gap-2 align-items-center">
      {/* Month */}
      <select className="form-select form-select-sm" style={{ width: 'auto' }} name={`month[${id}]`}>
        <option value=""></option>
        {MONTHS.map((month) => (
          <option key={month.value} value={month.value}>
            {month.label}
          </option>
        ))}
      </select>

      {/* Day (if applicable) */}
      {showDay && (
        <select className="form-select form-select-sm" style={{ width: '80px' }} name={`day[${id}]`}>
          <option value=""></option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      )}

      {/* Year */}
      <select className="form-select form-select-sm" style={{ width: 'auto' }} name={`year[${id}]`}>
        <option value=""></option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      {/* Present checkbox */}
      {showPresent && (
        <div className="form-check ms-2">
          <input type="checkbox" className="form-check-input" id={`present_${id}`} />
          <label className="form-check-label" htmlFor={`present_${id}`}>
            Present
          </label>
        </div>
      )}
    </div>
  );
};

// Entity Preview
const EntityPreview: React.FC<{ entity: FormEntity }> = ({ entity }) => {
  const isAddMore = entity.type === 'addmore';

  return (
    <div className="card mb-4">
      <div className="card-header d-flex justify-content-between align-items-center">
        <span>{entity.title}</span>
        {isAddMore && (
          <button type="button" className="btn btn-sm btn-outline-primary">
            + Add Another
          </button>
        )}
      </div>
      <div className="card-body">
        {entity.children.map((child) => (
          <NodePreview key={child.id} node={child} />
        ))}
      </div>
    </div>
  );
};

// ConditionSet Preview with conditional logic
const ConditionSetPreview: React.FC<{ conditionSet: FormConditionSet }> = ({ conditionSet }) => {
  const { answers } = usePreviewContext();

  // Find trigger question(s) in children
  const triggerQuestions = conditionSet.children.filter(
    (child) => child.nodeType === 'question'
  ) as FormQuestion[];

  // Find conditionals
  const conditionals = conditionSet.children.filter(
    (child) => child.nodeType === 'conditional'
  ) as FormConditional[];

  // Get trigger question IDs and their current values
  const triggerValues = triggerQuestions.map((q) => ({
    id: q.id,
    value: answers[q.id] || '',
    triggerValue: q.triggerValue,
  }));

  // Normalize value for boolean comparison (handles Yes/No, true/false, 1/0)
  const normalizeToBoolean = (value: string): string | null => {
    if (!value) return null;
    const lower = value.toLowerCase();
    if (['true', 'yes', '1'].includes(lower)) return 'true';
    if (['false', 'no', '0'].includes(lower)) return 'false';
    return null;
  };

  // Check if a single trigger value matches a condition
  const valueMatchesCondition = (value: string, condition: string): boolean => {
    if (!value) return false;

    // Exact match
    if (value === condition) return true;

    // Case-insensitive match
    if (value.toLowerCase() === condition.toLowerCase()) return true;

    // Boolean normalization (Yes/No, true/false, 1/0)
    const normalizedValue = normalizeToBoolean(value);
    const normalizedCondition = normalizeToBoolean(condition);
    if (normalizedValue && normalizedCondition && normalizedValue === normalizedCondition) {
      return true;
    }

    return false;
  };

  // Check if a conditional should be visible based on operator and trigger values
  const shouldShowConditional = (conditional: FormConditional): boolean => {
    const condition = conditional.condition;

    // No triggers answered yet
    if (triggerValues.every((t) => !t.value)) return false;

    // Switch operator: condition format is ";value1;value2;" or "value1" or multiple values
    if (conditionSet.operator === 'switch') {
      return triggerValues.some((t) => {
        if (!t.value) return false;
        // Check if condition contains the value in ;value; format
        if (condition.includes(';')) {
          return condition.includes(`;${t.value};`) ||
                 condition.startsWith(`${t.value};`) ||
                 condition.endsWith(`;${t.value}`) ||
                 condition === t.value;
        }
        // Direct match for simple conditions
        return valueMatchesCondition(t.value, condition);
      });
    }

    // "else" operator: show when no other conditionals match (fallback)
    if (condition === 'else' || conditionSet.operator === 'else') {
      // This will be handled by showing else when nothing else matches
      return true;
    }

    // "contain" operator: check if answer contains the condition string
    if (conditionSet.operator === 'contain') {
      return triggerValues.some((t) => {
        if (!t.value) return false;
        return t.value.toLowerCase().includes(condition.toLowerCase());
      });
    }

    // "and" operator: ALL triggers must match the condition
    if (conditionSet.operator === 'and') {
      return triggerValues.every((t) => valueMatchesCondition(t.value, condition));
    }

    // "or" operator (default): AT LEAST ONE trigger must match
    return triggerValues.some((t) => valueMatchesCondition(t.value, condition));
  };

  // For else conditions, check if any non-else conditional is visible
  const hasVisibleNonElseConditional = conditionals.some((c) => {
    if (c.condition === 'else') return false;
    return shouldShowConditional(c);
  });

  return (
    <div className="mb-3">
      {/* Render trigger questions */}
      {triggerQuestions.map((question) => (
        <NodePreview key={question.id} node={question as FormNode} />
      ))}

      {/* Render other non-conditional children (descriptions, warnings, notes) */}
      {conditionSet.children
        .filter((child) => child.nodeType !== 'question' && child.nodeType !== 'conditional')
        .map((child) => (
          <NodePreview key={child.id} node={child as FormNode} />
        ))}

      {/* Render conditionals based on trigger value */}
      {conditionals.map((conditional) => {
        // Handle "else" condition - only show if no other conditional is visible
        if (conditional.condition === 'else') {
          if (hasVisibleNonElseConditional) return null;
          // Only show else if at least one trigger has a value
          if (triggerValues.every((t) => !t.value)) return null;
          return <ConditionalPreview key={conditional.id} conditional={conditional} />;
        }

        const isVisible = shouldShowConditional(conditional);
        if (!isVisible) return null;

        return (
          <ConditionalPreview key={conditional.id} conditional={conditional} />
        );
      })}
    </div>
  );
};

// Conditional Preview (no border, just indent)
const ConditionalPreview: React.FC<{ conditional: FormConditional }> = ({ conditional }) => (
  <div className="conditional-content">
    {conditional.children.map((child) => (
      <NodePreview key={child.id} node={child} />
    ))}
  </div>
);
