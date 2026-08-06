// engineModel.ts
//
// SINGLE SOURCE OF TRUTH for the E-Bar form XML engine.
//
// Every rule here is distilled from the real Java engine and verified against it:
//   - element dispatch:  ILG-EBAS-E-Bar/.../ilg/ebar/forms/NodeManager.populateNodes
//   - node models:       ILG-Common/.../ilg/common/forms/*.java (buildAttributes)
//   - question renderer: ILG-EBAS-E-Bar/.../ilg/ebar/forms/Question.setType
//   - date renderer:     ILG-Common/.../ilg/common/renderer/DateQuestionRenderer
//   - profile fields:    ILG-EBAS-E-Bar/.../ilg/ebar/forms/Reference.getReference
//   - templates:         ILG-EBAS-E-Bar/tpl_v3/*.tpl
//
// This one module feeds THREE consumers so they never drift apart:
//   A) validation.ts   - turns these rules into validator checks
//   C) /reference page  - renders this catalog as human documentation
//   B) preview          - implements the runtime semantics described here
//
// There is NO DTD/XSD for these forms. This model IS the contract.

import { PROFILE_REFERENCE_FIELDS, ProfileReferenceField } from '@/types/form';

// ---------------------------------------------------------------------------
// Severity vocabulary
// ---------------------------------------------------------------------------
// What the real engine does when a rule is violated:
//   'crash'   -> Java throws NPE in buildAttributes; loadList catches it, logs,
//                and returns false => THE ENTIRE FORM FAILS TO LOAD. Blocking error.
//   'invisible' -> parses fine but the node/question renders as empty output.
//                  Almost always a bug the author did not intend. Blocking error.
//   'degrade' -> parses and renders, but not the way the author probably meant
//                (e.g. an unknown date format silently becomes mm/dd/yy). Warning.
//   'ok'      -> attribute is genuinely optional with a defined default.
export type MissingEffect = 'crash' | 'invisible' | 'degrade' | 'ok';

export interface AttrRule {
  /** attribute name as written in XML */
  name: string;
  /** what happens in the real engine if this attribute is absent */
  whenMissing: MissingEffect;
  /** human explanation shown in docs and validator messages */
  effect: string;
  /** if set, the attribute value must be one of these */
  values?: readonly string[];
  /** what happens if the value is not in `values` */
  whenUnknown?: 'crash' | 'invisible' | 'degrade';
  /** human explanation for an out-of-enum value */
  unknownEffect?: string;
  /** true when the engine reads this but with a null-guard/default (documentation only) */
  optionalNote?: string;
}

export interface ElementRule {
  /** XML tag name */
  tag: string;
  /** FormForge nodeType (usually === tag, but 'required-doc' etc. line up) */
  nodeType: string;
  /** one-line purpose for docs */
  purpose: string;
  /** attribute contract */
  attrs: AttrRule[];
  /** tags allowed as direct children (docs only; '*' means "the subsection child set") */
  allowedChildren: readonly string[];
  /** extra notes for docs */
  notes?: readonly string[];
}

// Every element carries an `id`. IlgNode.buildAttributes dereferences it with no
// null-check AND parses it as an int, so a missing OR non-numeric id crashes the load.
const ID_RULE: AttrRule = {
  name: 'id',
  whenMissing: 'crash',
  effect:
    'The engine reads id on every element with no null-check and parses it as an integer. Missing or non-numeric id throws and the whole form fails to load.',
};

// The child set shared by subsection and entity.
export const SUBSECTION_CHILD_SET = [
  'question',
  'entity',
  'conditionset',
  'conditionlogic',
  'description',
  'simpletext',
  'note',
  'warning',
  'validator',
  'includeform',
  'required-doc',
] as const;

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------
export const ELEMENTS: ElementRule[] = [
  {
    tag: 'questionnaire',
    nodeType: 'questionnaire',
    purpose: 'Root of a standalone form (files under states/<st>/xml/forms/).',
    allowedChildren: ['validator', 'section'],
    attrs: [
      ID_RULE,
      { name: 'nextid', whenMissing: 'crash', effect: 'Read without null-check. Missing => form fails to load. Must exceed every used numeric id prefix.' },
      { name: 'suffix', whenMissing: 'crash', effect: 'Read without null-check. Missing => form fails to load. Every id = <prefix><suffix>.' },
      { name: 'title', whenMissing: 'ok', effect: 'Display title. Optional.', optionalNote: 'defaults to empty' },
      { name: 'order', whenMissing: 'ok', effect: 'Ignored by the engine but every form carries order="0".' },
    ],
    notes: ['id = <numeric prefix><suffix>. nextid must stay strictly greater than every used prefix.'],
  },
  {
    tag: 'subform',
    nodeType: 'subform',
    purpose: 'Root of an includable subform (files under states/<st>/xml/subforms/).',
    allowedChildren: [...SUBSECTION_CHILD_SET],
    attrs: [
      ID_RULE,
      { name: 'suffix', whenMissing: 'crash', effect: 'Read inside a NumberFormat try/catch, but a missing suffix NPEs out of that catch => form fails to load. Effectively required.' },
      { name: 'nextid', whenMissing: 'ok', effect: 'Next free numeric prefix.', optionalNote: 'defaults to 1 if absent' },
      { name: 'title', whenMissing: 'ok', effect: 'Display title.' },
      { name: 'shorttitle', whenMissing: 'ok', effect: 'Short display title.' },
    ],
  },
  {
    tag: 'section',
    nodeType: 'section',
    purpose: 'Top-level grouping inside a questionnaire; also added to the form menu.',
    allowedChildren: ['subsection'],
    attrs: [
      ID_RULE,
      { name: 'title', whenMissing: 'crash', effect: 'Read without null-check => missing crashes the form load.' },
      { name: 'print', whenMissing: 'ok', effect: 'print="false" hides from print output; defaults to printed.' },
      { name: 'showinbaradmin', whenMissing: 'ok', effect: 'showinbaradmin="false" hides in the bar-admin view.' },
    ],
  },
  {
    tag: 'subsection',
    nodeType: 'subsection',
    purpose: 'Grouping inside a section; holds the actual questions and logic.',
    allowedChildren: [...SUBSECTION_CHILD_SET],
    attrs: [
      ID_RULE,
      { name: 'title', whenMissing: 'crash', effect: 'Read without null-check => missing crashes the form load.' },
      { name: 'depends', whenMissing: 'ok', effect: 'conditionset/conditionlogic id that gates this whole subsection.' },
      { name: 'condition', whenMissing: 'ok', effect: 'true|false paired with depends: show the subsection when the depended logic evaluates to this.' },
      { name: 'print', whenMissing: 'ok', effect: 'print="false" hides from print output.' },
      { name: 'showinbaradmin', whenMissing: 'ok', effect: 'showinbaradmin="false" hides in the bar-admin view.' },
    ],
  },
  {
    tag: 'entity',
    nodeType: 'entity',
    purpose: 'Repeating or grouped block of questions (e.g. "list every prior job").',
    allowedChildren: [...SUBSECTION_CHILD_SET],
    attrs: [
      ID_RULE,
      { name: 'type', whenMissing: 'crash', effect: 'Read without null-check => missing crashes the load.', values: ['single', 'addmore', 'maingroup', 'subgroup', ''], whenUnknown: 'degrade', unknownEffect: 'Unknown entity type behaves like "single" (no add-more, rendered once).' },
      { name: 'title', whenMissing: 'crash', effect: 'Read without null-check => missing crashes the load.' },
      { name: 'min', whenMissing: 'crash', effect: 'Read bare; a missing min NPEs out of the NumberFormat catch => form fails to load. Effectively required (min completeness count).' },
      { name: 'max', whenMissing: 'crash', effect: 'Read bare; a missing max NPEs out of the NumberFormat catch => form fails to load. Effectively required (max=0 means unlimited).' },
      { name: 'order', whenMissing: 'ok', effect: 'This instance index. order="0" is the template blueprint; order>0 are user-added copies.' },
      { name: 'nextorder', whenMissing: 'ok', effect: 'Index the next added copy will take.' },
      { name: 'grouptype', whenMissing: 'ok', effect: 'Grouping label, paired with maingroup/subgroup.' },
      { name: 'showinbaradmin', whenMissing: 'ok', effect: 'showinbaradmin="false" hides in the bar-admin view.' },
    ],
    notes: [
      'addmore: only the order="0" instance is authored; the engine clones it as the applicant adds rows.',
      'min = required instance count for completeness; max=0 = unlimited, otherwise caps the Add-more link.',
    ],
  },
  {
    tag: 'question',
    nodeType: 'question',
    purpose: 'A single input (or a read-only notice). The type attribute picks the renderer.',
    allowedChildren: ['description', 'option', 'reference'],
    attrs: [
      ID_RULE,
      { name: 'type', whenMissing: 'crash', effect: 'Selects the renderer; read without null-check => missing crashes the load.', values: [], whenUnknown: 'invisible', unknownEffect: 'A type that matches no renderer leaves the renderer null => the question renders as empty output, silently. (See the Question Types table for valid values.)' },
      { name: 'format', whenMissing: 'ok', effect: 'Sub-variant of the type (date sub-format, text size, state filter, etc.).' },
      { name: 'required', whenMissing: 'ok', effect: 'required="true" makes the answer mandatory; anything else (including required="") is treated as false.' },
      { name: 'triggervalue', whenMissing: 'ok', effect: 'Inside a conditionset, the answer value that makes this trigger question "pass".' },
      { name: 'comment', whenMissing: 'ok', effect: 'Author comment; not rendered.' },
      { name: 'maxlength', whenMissing: 'ok', effect: 'Input length cap.', optionalNote: 'defaults to 500 for char, 5000 for text' },
      { name: 'validatorclass', whenMissing: 'ok', effect: 'Fully-qualified Java validator applied to the answer.' },
      { name: 'validationmessage', whenMissing: 'ok', effect: 'Error text shown when the validator fails.' },
      { name: 'app_type', whenMissing: 'ok', effect: 'Application-category code (A-N/X) this question can activate.' },
      { name: 'app_type_trigger', whenMissing: 'ok', effect: 'The answer value that activates the app_type category.' },
    ],
    notes: [
      'type="text" and type="" are matched case-sensitively: only lowercase works. Every other type is case-insensitive.',
      'radio, radioseperate and select need <option> children (select may instead pull from a <reference>).',
      'profilereference needs a <reference table field> child.',
    ],
  },
  {
    tag: 'description',
    nodeType: 'description',
    purpose: 'The label/prose of a question (or standalone text in a subsection).',
    allowedChildren: [],
    attrs: [
      ID_RULE,
      { name: 'prefix', whenMissing: 'ok', effect: 'The displayed question number, e.g. "21." or "a)".' },
    ],
    notes: ['All human-readable text must be inside CDATA; raw child tags are flattened away by the engine.'],
  },
  {
    tag: 'option',
    nodeType: 'option',
    purpose: 'A choice for a radio / radioseperate / select question. Text = the label.',
    allowedChildren: [],
    attrs: [
      ID_RULE,
      { name: 'value', whenMissing: 'crash', effect: 'Read without null-check => a missing value on any <option> crashes the form load.' },
    ],
  },
  {
    tag: 'reference',
    nodeType: 'reference',
    purpose: 'Pulls a value from the applicant profile / exam session into a question.',
    allowedChildren: [],
    attrs: [
      ID_RULE,
      { name: 'table', whenMissing: 'crash', effect: 'Read without null-check => missing crashes the load. Usually "profile".' },
      { name: 'field', whenMissing: 'crash', effect: 'Read without null-check => missing crashes the load.', whenUnknown: 'degrade', unknownEffect: 'A field name not handled by Reference.getReference returns empty/default silently. (See the Profile Fields list.)' },
    ],
  },
  {
    tag: 'conditionset',
    nodeType: 'conditionset',
    purpose: 'Trigger-value based branching: trigger question(s) + conditional branches.',
    allowedChildren: ['question', 'conditional', 'description', 'note', 'warning'],
    attrs: [
      ID_RULE,
      { name: 'operator', whenMissing: 'crash', effect: 'Read without null-check => missing crashes the load.', values: ['and', 'or', 'smaller', 'switch', 'contain', 'else'], whenUnknown: 'degrade', unknownEffect: 'An unknown operator falls through to the "and" branch. ("else" is a defined constant but the evaluator never reads it.)' },
    ],
  },
  {
    tag: 'conditional',
    nodeType: 'conditional',
    purpose: 'One branch body of a conditionset, shown when the set evaluates to its condition.',
    allowedChildren: [...SUBSECTION_CHILD_SET],
    attrs: [
      ID_RULE,
      { name: 'condition', whenMissing: 'crash', effect: 'Read without null-check => missing crashes the load. Holds "true"/"false" (and/or/contain/smaller) or a ";v1;v2;" token list (switch).' },
    ],
  },
  {
    tag: 'conditionlogic',
    nodeType: 'conditionlogic',
    purpose: 'Question-id based gate: <condition> children referencing other questions by id.',
    allowedChildren: ['condition', ...SUBSECTION_CHILD_SET],
    attrs: [
      ID_RULE,
      { name: 'operator', whenMissing: 'crash', effect: 'Read without null-check => missing crashes the load.', values: ['and', 'or'], whenUnknown: 'degrade', unknownEffect: 'Only "and" and "or" are read; anything else behaves like "or".' },
    ],
    notes: ['Must live inside a subsection or entity: the evaluator dereferences the parent subsection and NPEs if there is none.'],
  },
  {
    tag: 'condition',
    nodeType: 'condition',
    purpose: 'One clause of a conditionlogic: compare a referenced question\'s answer to a value.',
    allowedChildren: [],
    attrs: [
      ID_RULE,
      { name: 'questionid', whenMissing: 'crash', effect: 'Int id of the question to test; read without null-check => missing crashes the load.' },
      { name: 'value', whenMissing: 'crash', effect: 'The value to compare the answer against; read without null-check => missing crashes the load.' },
      { name: 'equals', whenMissing: 'crash', effect: 'equals="true" means answer must equal value; otherwise must NOT equal. Read without null-check => missing crashes the load.' },
    ],
  },
  {
    tag: 'includeform',
    nodeType: 'includeform',
    purpose: 'Embeds a subform (subforms/<formname>.xml) into this form.',
    allowedChildren: [],
    attrs: [
      ID_RULE,
      { name: 'type', whenMissing: 'crash', effect: 'online|offline|attachment; read without null-check => missing crashes the load.' },
      { name: 'formname', whenMissing: 'crash', effect: 'Resolves to subforms/<formname>.xml; read without null-check => missing crashes the load.' },
      { name: 'required', whenMissing: 'ok', effect: 'Defaults to TRUE; only required="false" makes the include optional.' },
      { name: 'multipleinclude', whenMissing: 'ok', effect: 'multipleinclude="true" allows repeated instances.' },
      { name: 'title', whenMissing: 'ok', effect: 'Display title for the include.' },
    ],
  },
  {
    tag: 'required-doc',
    nodeType: 'required-doc',
    purpose: 'Declares a document the applicant must upload.',
    allowedChildren: [],
    attrs: [
      ID_RULE,
      { name: 'title', whenMissing: 'crash', effect: 'Read before its try-block with no null-check => a missing title crashes the load.' },
      { name: 'preventsubmit', whenMissing: 'ok', effect: 'preventsubmit="true" blocks submission until the doc is provided.' },
    ],
  },
  {
    tag: 'validator',
    nodeType: 'validator',
    purpose: 'Standalone validator attached to a subsection/entity.',
    allowedChildren: [],
    attrs: [
      ID_RULE,
      { name: 'validatorclass', whenMissing: 'crash', effect: 'Fully-qualified Java class; read without null-check => missing crashes the load.' },
    ],
  },
  {
    tag: 'note',
    nodeType: 'note',
    purpose: 'A note; can be added to the application checklist.',
    allowedChildren: [],
    attrs: [
      ID_RULE,
      { name: 'prefix', whenMissing: 'ok', effect: 'Optional leading marker.' },
      { name: 'ischeckitem', whenMissing: 'ok', effect: 'ischeckitem="true" adds it to the checklist while its parent conditional passes.' },
    ],
    notes: ['Text is read from element content, so keep human text in CDATA.'],
  },
  {
    tag: 'warning',
    nodeType: 'warning',
    purpose: 'A warning message; can block submission.',
    allowedChildren: [],
    attrs: [
      ID_RULE,
      { name: 'preventsubmit', whenMissing: 'ok', effect: 'preventsubmit="true" blocks submission while shown.' },
    ],
  },
  {
    tag: 'simpletext',
    nodeType: 'simpletext',
    purpose: 'A bare HTML fragment rendered verbatim (template is literally "%s").',
    allowedChildren: [],
    attrs: [ID_RULE],
    notes: ['Only id is read; a prefix attribute is ignored. Used for letter-style prose around inline questions.'],
  },
];

export const ELEMENT_BY_NODETYPE: Record<string, ElementRule> = Object.fromEntries(
  ELEMENTS.map((e) => [e.nodeType, e])
);

// ---------------------------------------------------------------------------
// Question types  (ebar/forms/Question.setType)
// ---------------------------------------------------------------------------
export type FormatKind = 'none' | 'date' | 'state' | 'text' | 'lawschool' | 'select' | 'profile';

export interface QuestionTypeSpec {
  type: string;
  renderer: string;
  description: string;
  /** needs at least one <option> child (or, for select, a <reference>) */
  needsOptions?: boolean;
  /** needs a <reference> child */
  needsReference?: boolean;
  /** matched case-sensitively by the engine (only 'text' and '') */
  caseSensitive?: boolean;
  /** which format vocabulary applies */
  formatKind: FormatKind;
  category: 'text' | 'selection' | 'date' | 'location' | 'special';
}

export const QUESTION_TYPES: QuestionTypeSpec[] = [
  { type: 'char', renderer: 'TextQuestionRenderer', description: 'Single-line text input. format="number" makes it numeric.', formatKind: 'text', category: 'text' },
  { type: 'text', renderer: 'TextAreaQuestionRenderer', description: 'Multi-line textarea. format="large" enlarges it, format="richtext" gives a rich editor.', caseSensitive: true, formatKind: 'text', category: 'text' },
  { type: '', renderer: 'TextQuestionRenderer', description: 'Legacy empty type: behaves like char. Matched case-sensitively.', caseSensitive: true, formatKind: 'none', category: 'text' },
  { type: 'ssn', renderer: 'SsnQuestionRenderer', description: 'Masked SSN input.', formatKind: 'none', category: 'text' },
  { type: 'radio', renderer: 'RadioQuestionRenderer', description: 'Radio-button group built from <option> children.', needsOptions: true, formatKind: 'none', category: 'selection' },
  { type: 'radioseperate', renderer: 'RadioSeperateQuestionRenderer', description: 'Radios interleaved into the description text, which is split by the literal token <----> into 2-5 segments. Option count must equal the segment count.', needsOptions: true, formatKind: 'none', category: 'selection' },
  { type: 'select', renderer: 'SelectQuestionRenderer', description: 'Dropdown from <option> children (or a <reference>). format: multi, multi-checkbox, alt.', needsOptions: true, formatKind: 'select', category: 'selection' },
  { type: 'date', renderer: 'DateQuestionRenderer', description: 'Month/day/year selects driven by format.', formatKind: 'date', category: 'date' },
  { type: 'emp_date_start', renderer: 'DateQuestionRenderer', description: 'Employment start date (paired with a gap validator).', formatKind: 'date', category: 'date' },
  { type: 'emp_date_end', renderer: 'DateQuestionRenderer', description: 'Employment end date; present_* formats add a "Present" checkbox.', formatKind: 'date', category: 'date' },
  { type: 'res_date_start', renderer: 'DateQuestionRenderer', description: 'Residence start date.', formatKind: 'date', category: 'date' },
  { type: 'res_date_end', renderer: 'DateQuestionRenderer', description: 'Residence end date; present_* formats add a "Present" checkbox.', formatKind: 'date', category: 'date' },
  { type: 'time', renderer: 'TimeQuestionRenderer', description: 'Time selects.', formatKind: 'none', category: 'date' },
  { type: 'zip', renderer: 'ZipQuestionRenderer', description: 'ZIP code input.', formatKind: 'none', category: 'location' },
  { type: 'state', renderer: 'StateQuestionRenderer', description: 'State/province select. format: exclude_state, exclude_province, gov_state.', formatKind: 'state', category: 'location' },
  { type: 'state_ube', renderer: 'UbeStateQuestionRenderer', description: 'UBE jurisdiction select.', formatKind: 'none', category: 'location' },
  { type: 'state_ube_oct', renderer: 'UbeOctStateQuestionRenderer', description: 'UBE state select (NJ October variant). Defined but unused in the corpus.', formatKind: 'none', category: 'location' },
  { type: 'state_ube_cur_exp', renderer: 'UbeStateExceptCurrentQuestionRenderer', description: 'UBE state select excluding the current jurisdiction.', formatKind: 'none', category: 'location' },
  { type: 'state_mutual', renderer: 'MutualStateQuestionRenderer', description: 'Mutual-recognition state select.', formatKind: 'none', category: 'location' },
  { type: 'country', renderer: 'CountryQuestionRenderer', description: 'Country select.', formatKind: 'none', category: 'location' },
  { type: 'county', renderer: 'CountyQuestionRenderer', description: 'County select.', formatKind: 'none', category: 'location' },
  { type: 'lawschool', renderer: 'LawSchoolQuestionRenderer', description: 'Law-school select (value -2 = Other). format: aba, all.', formatKind: 'lawschool', category: 'special' },
  { type: 'examsite', renderer: 'ExamSiteQuestionRenderer', description: 'Exam-site select.', formatKind: 'none', category: 'special' },
  { type: 'entityname', renderer: 'EntityListQuestionRenderer', description: 'Entity/name select.', formatKind: 'none', category: 'special' },
  { type: 'employer', renderer: 'EmployerQuestionRenderer', description: 'Employer select.', formatKind: 'none', category: 'special' },
  { type: 'supervisor', renderer: 'SupervisorQuestionRenderer', description: 'Supervising-attorney select.', formatKind: 'none', category: 'special' },
  { type: 'notice', renderer: 'NoticeQuestionRenderer', description: 'Read-only notice block; no input.', formatKind: 'none', category: 'special' },
  { type: 'signature', renderer: 'SignatureQuestionRenderer', description: 'Signature box (pair with SignatureValidator).', formatKind: 'none', category: 'special' },
  { type: 'profilereference', renderer: 'ProfileReferenceRenderer', description: 'Read-only value pulled from the profile via a <reference> child.', needsReference: true, formatKind: 'profile', category: 'special' },
  { type: 'examreference', renderer: 'ExamReferenceRenderer', description: 'Exam-session reference value.', formatKind: 'none', category: 'special' },
  { type: 'phonenumber', renderer: 'PhoneNumberRenderer', description: 'Phone-number input.', formatKind: 'none', category: 'special' },
];

export const QUESTION_TYPE_SET: Set<string> = new Set(QUESTION_TYPES.map((t) => t.type));
export const QUESTION_TYPE_BY_NAME: Record<string, QuestionTypeSpec> = Object.fromEntries(
  QUESTION_TYPES.map((t) => [t.type, t])
);
/** types that render as a <option>-bearing choice */
export const OPTION_BEARING_TYPES = new Set(['radio', 'radioseperate', 'select']);
/** types in the date family (share the DATE_FORMATS vocabulary) */
export const DATE_FAMILY_TYPES = new Set(['date', 'emp_date_start', 'emp_date_end', 'res_date_start', 'res_date_end']);
/**
 * Read-only value-display types. They render a value pulled from the profile /
 * exam session, not an input prompt, so their label is conventionally supplied
 * by an adjacent <simpletext>/<description> sibling rather than a description
 * child. A missing description child is therefore NORMAL for these and must NOT
 * be flagged as "renders without a label".
 */
export const VALUE_DISPLAY_TYPES = new Set(['profilereference', 'examreference']);

// ---------------------------------------------------------------------------
// Format vocabularies
// ---------------------------------------------------------------------------
export interface FormatSpec {
  value: string;
  label: string;
  note: string;
}

export const DATE_FORMATS: FormatSpec[] = [
  { value: '', label: 'mm/dd/yy (full)', note: 'Empty format = full month/day/year.' },
  { value: 'mm/dd/yy', label: 'Full month/day/year', note: 'Not a distinct engine constant; the engine renders it as the default full mm/dd/yy. Accepted spelling.' },
  { value: 'mm/dd/yyyy', label: 'Full month/day/year (4-digit)', note: 'Not a distinct engine constant; renders as the default full date. Accepted spelling.' },
  { value: 'mm/yy', label: 'Month + Year', note: 'Month and year only.' },
  { value: 'yy', label: 'Year only', note: 'Year select only.' },
  { value: 'present_mm/yy', label: 'Month/Year + Present', note: 'Adds a "Present" checkbox; year range is birth-era.' },
  { value: 'present_mm/dd/yy', label: 'Full + Present', note: 'Full date plus a "Present" checkbox.' },
  { value: 'future_mm/yy', label: 'Future Month/Year', note: 'Year range leans to upcoming years.' },
  { value: 'future_mm/dd/yy', label: 'Future full date', note: 'Full date, future-leaning years.' },
  { value: 'ube_mm/yy', label: 'UBE Month/Year', note: 'Month/year with a wider back range.' },
  { value: 'dob_mm/yy', label: 'DOB Month/Year', note: 'Birth month/year range.' },
  { value: 'dob_mm/dd/yy', label: 'DOB full date', note: 'Birth full date range.' },
  { value: 'july_feb', label: 'July / February only', note: 'Month list limited to Feb and July (bar exam months).' },
  { value: 'mpre_month', label: 'MPRE months', note: 'Month list limited to Mar / Aug / Nov.' },
];
export const DATE_FORMAT_SET = new Set(DATE_FORMATS.map((f) => f.value));

export const STATE_FORMATS: FormatSpec[] = [
  { value: '', label: 'All states', note: 'Default full list.' },
  { value: 'exclude_state', label: 'Exclude states', note: 'Provinces/territories only.' },
  { value: 'exclude_province', label: 'Exclude provinces', note: 'US states only.' },
  { value: 'gov_state', label: 'Government states', note: 'Government jurisdiction list.' },
];
export const STATE_FORMAT_SET = new Set(STATE_FORMATS.map((f) => f.value));

export const TEXT_FORMATS: FormatSpec[] = [
  { value: '', label: 'Default', note: 'Plain input/textarea.' },
  { value: 'number', label: 'Number (char)', note: 'char + format="number" renders a numeric input.' },
  { value: 'large', label: 'Large (text)', note: 'text + format="large" renders a big textarea.' },
  { value: 'richtext', label: 'Rich text (text)', note: 'text + format="richtext" renders a rich editor.' },
  { value: 'email', label: 'Email hint', note: 'Profile/NCBE mapping hint.' },
  { value: 'multi-checkbox', label: 'Multi checkbox (select)', note: 'select + format="multi-checkbox".' },
];

// ---------------------------------------------------------------------------
// Condition operators  (ConditionSet / ConditionLogic)
// ---------------------------------------------------------------------------
export interface OperatorSpec {
  value: string;
  label: string;
  appliesTo: 'conditionset' | 'conditionlogic' | 'both';
  semantics: string;
}

export const CONDITION_OPERATORS: OperatorSpec[] = [
  { value: 'and', label: 'AND', appliesTo: 'both', semantics: 'Every trigger question whose triggervalue is set must have an answer equal to its triggervalue. All pass => the conditional condition="true" branch shows; any mismatch => the condition="false" branch shows.' },
  { value: 'or', label: 'OR', appliesTo: 'both', semantics: 'The first trigger question whose answer equals its triggervalue makes the set pass immediately.' },
  { value: 'smaller', label: 'SMALLER (date compare)', appliesTo: 'conditionset', semantics: 'Compares the answers of exactly two child questions as dates. "present" means now. Passes when the first date is after the second.' },
  { value: 'switch', label: 'SWITCH', appliesTo: 'conditionset', semantics: 'Each answer t is wrapped as ";t;" and matched against each conditional condition=";v1;v2;" token list; the first containing branch is shown.' },
  { value: 'contain', label: 'CONTAIN', appliesTo: 'conditionset', semantics: 'Passes when the answer contains the triggervalue OR the triggervalue contains the answer (substring, either direction).' },
  { value: 'else', label: 'ELSE (unused)', appliesTo: 'conditionset', semantics: 'Defined as a constant but the evaluator never reads it, so it never matches. Do not rely on it.' },
];
export const CONDITIONSET_OPERATOR_SET = new Set(CONDITION_OPERATORS.filter((o) => o.appliesTo !== 'conditionlogic').map((o) => o.value));
export const CONDITIONLOGIC_OPERATOR_SET = new Set(['and', 'or']);

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------
export const ENTITY_TYPES: { value: string; label: string; note: string }[] = [
  { value: 'single', label: 'Single', note: 'Exactly one instance, rendered inline.' },
  { value: 'addmore', label: 'Add-more (repeating)', note: 'Repeatable; order="0" is the template, the applicant adds order>0 copies. Honors min/max.' },
  { value: 'maingroup', label: 'Main group', note: 'Grouping wrapper (paired with grouptype).' },
  { value: 'subgroup', label: 'Sub group', note: 'Nested grouping wrapper (paired with grouptype).' },
  { value: '', label: '(empty)', note: 'Behaves like single.' },
];
export const ENTITY_TYPE_SET = new Set(ENTITY_TYPES.map((e) => e.value));

// ---------------------------------------------------------------------------
// Profile reference fields  (re-exported from types; the authoritative list is
// Reference.getReference in the E-Bar engine)
// ---------------------------------------------------------------------------
export { PROFILE_REFERENCE_FIELDS };
export type { ProfileReferenceField };
export const PROFILE_FIELD_SET: Set<string> = new Set(PROFILE_REFERENCE_FIELDS.map((f) => f.value));
/** fields that make a profilereference question block completion until resolved */
export const BLOCKING_PROFILE_FIELDS = new Set(['ncbe_number', 'interview_county']);

// ---------------------------------------------------------------------------
// Validator classes actually referenced in the corpus.
// The engine tries the FQN as written, then retries with the ilg.ebar.forms ->
// ilg.common prefix swap, so both prefixes resolve. We store the short class
// names and accept either package prefix.
// ---------------------------------------------------------------------------
export const KNOWN_VALIDATOR_SHORTNAMES = new Set([
  'EmailValidator',
  'CurrencyValidator',
  'ResidenceDateGapValidator',
  'ResidenceDateGapValidatorAHC',
  'EmpDateGapValidator',
  'EmpDateGapValidatorForAHC',
  'EmpDateGapValidatorForWaiver',
  'EmpDateGapValidatorForAOM',
  'PracticeEmpDateGapValidator',
  'UtLppResidenceDateGapValidator',
  'SignatureValidator',
  'SsnValidator',
  'WaCertificationDate',
  'LSACAccountValidator',
  'ExamSiteValidator',
  'AccommodationCheckValidator',
  'UBEDateValidator',
  'NjAbaLawSchoolValidator',
  'NcCommityAppValidator',
  'ScUBEValidator',
]);

/** Extract the short class name from a fully-qualified validator class. */
export const validatorShortName = (fqn: string): string => {
  const parts = fqn.trim().split('.');
  return parts[parts.length - 1] || '';
};

/** True when a validatorclass looks like a real E-Bar validator. */
export const isKnownValidatorClass = (fqn: string): boolean => {
  if (!fqn) return false;
  return KNOWN_VALIDATOR_SHORTNAMES.has(validatorShortName(fqn));
};
