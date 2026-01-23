'use client';

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

export const FormPreview: React.FC = () => {
  const { form } = useFormStore();

  if (!form) return null;

  return (
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
      `}</style>

      <div className="container py-4">
        {/* Form Title */}
        <h1 className="mb-4 text-center">{form.title}</h1>

        {/* Form Body */}
        <div id="formBody">
          <form name="ilgform" method="post" className="preview-form">
            <div className="ebas-form-questions mb-5" id="questions">
              {form.children.map((section) => (
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

// Description Preview
const DescriptionPreview: React.FC<{ description: FormDescription }> = ({ description }) => (
  <div className="form-row mb-2">
    <div className="qNum">{description.prefix}</div>
    <div>
      <span className="descControl">{description.text}</span>
    </div>
  </div>
);

// Warning Preview
const WarningPreview: React.FC<{ warning: FormWarning }> = ({ warning }) => (
  <div className="alert alert-warning mb-3">
    {warning.text}
  </div>
);

// Note Preview
const NotePreview: React.FC<{ note: FormNote }> = ({ note }) => (
  <div className="alert alert-info mb-3">
    {note.text}
  </div>
);

// Question Preview
const QuestionPreview: React.FC<{ question: FormQuestion }> = ({ question }) => {
  const description = question.children.find((c) => c.nodeType === 'description') as FormDescription | undefined;
  const options = question.children.filter((c) => c.nodeType === 'option') as FormOption[];
  const isRequired = question.required;

  const shortFieldTypes = ['zip', 'ssn', 'date', 'emp_date_start', 'emp_date_end', 'res_date_start', 'res_date_end'];
  const isShortField = shortFieldTypes.includes(question.type);

  return (
    <div className="row mb-3 align-items-start">
      {/* Question Number/Prefix */}
      <div className="col-auto" style={{ width: '40px' }}>
        {description?.prefix && <span className="fw-bold">{description.prefix}</span>}
      </div>

      {/* Label */}
      <div className={`col-4 ${isRequired ? 'text-danger' : ''}`}>
        <label htmlFor={question.id} className="form-label">
          {description?.text || 'Question'}
          {isRequired && <span className="text-danger">*</span>}
        </label>
        {question.comment && (
          <small className="d-block text-muted fst-italic">{question.comment}</small>
        )}
      </div>

      {/* Input Control */}
      <div className={`col ${isShortField ? 'd-flex justify-content-end' : ''}`}>
        <QuestionInput question={question} options={options} />
      </div>
    </div>
  );
};

// Question Input based on type
const QuestionInput: React.FC<{ question: FormQuestion; options: FormOption[] }> = ({ question, options }) => {
  const { type, format, id, maxlength } = question;

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
        <div className={type === 'radioseperate' ? '' : 'd-flex gap-3 justify-content-start'}>
          {options.map((opt) => (
            <div key={opt.id} className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                id={opt.id}
                name={`question[${id}]`}
                value={opt.value}
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
        <select className="form-select form-select-sm" id={id} name={`question[${id}]`}>
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

// ConditionSet Preview
const ConditionSetPreview: React.FC<{ conditionSet: FormConditionSet }> = ({ conditionSet }) => (
  <div className="mb-3">
    {conditionSet.children.map((child) => (
      <NodePreview key={child.id} node={child as FormNode} />
    ))}
  </div>
);

// Conditional Preview
const ConditionalPreview: React.FC<{ conditional: FormConditional }> = ({ conditional }) => (
  <div className="ms-4 ps-3 border-start border-2 border-secondary-subtle">
    {conditional.children.map((child) => (
      <NodePreview key={child.id} node={child} />
    ))}
  </div>
);
