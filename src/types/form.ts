// Question Types
export type QuestionType =
  | 'char'
  | 'text'
  | 'ssn'
  | 'radio'
  | 'radioseperate'
  | 'select'
  | 'date'
  | 'time'
  | 'emp_date_start'
  | 'emp_date_end'
  | 'res_date_start'
  | 'res_date_end'
  | 'state'
  | 'state_ube'
  | 'state_mutual'
  | 'country'
  | 'county'
  | 'zip'
  | 'lawschool'
  | 'examsite'
  | 'signature'
  | 'profilereference'
  | 'examreference'
  | 'notice';

// Date Formats
export type DateFormat =
  | ''
  | 'mm/yy'
  | 'yy'
  | 'mm/dd/yy'
  | 'mm/dd/yyyy'
  | 'present_mm/yy'
  | 'present_mm/dd/yy'
  | 'future_mm/yy'
  | 'future_mm/dd/yy'
  | 'ube_mm/yy'
  | 'dob_mm/yy'
  | 'dob_mm/dd/yy'
  | 'july_feb'
  | 'mpre_month';

// State Formats
export type StateFormat =
  | ''
  | 'exclude_state'
  | 'exclude_province'
  | 'gov_state';

// Text Formats
export type TextFormat =
  | ''
  | 'large'
  | 'email'
  | 'integer';

// Lawschool Formats
export type LawschoolFormat =
  | ''
  | 'aba'
  | 'all';

// ConditionSet Operators
export type ConditionOperator =
  | 'and'
  | 'or'
  | 'smaller'
  | 'switch'
  | 'contain'
  | 'else';

// Entity Types
export type EntityType = 'single' | 'addmore';

// Validator Classes
export type ValidatorClass =
  | ''
  | 'ilg.common.validators.EmailValidator'
  | 'ilg.common.validators.CurrencyValidator'
  | 'ilg.common.validators.SignatureValidator'
  | 'ilg.common.validators.ResidenceDateGapValidator'
  | 'ilg.common.validators.EmpDateGapValidator'
  | 'ilg.common.validators.WaCertificationDate';

// Profile Reference Fields
export type ProfileReferenceField =
  | 'fullname'
  | 'ssn'
  | 'dob'
  | 'place_of_birth'
  | 'title'
  | 'ncbe_number'
  | 'address1'
  | 'address2'
  | 'city'
  | 'state'
  | 'zip'
  | 'county'
  | 'country'
  | 'email'
  | 'cellphone'
  | 'primaryphone'
  | 'fax'
  | 'firmname'
  | 'addresstype';

// Base Node Interface
export interface BaseNode {
  id: string;
  nodeType: string;
  order?: number;
}

// Option (for radio/select)
export interface FormOption extends BaseNode {
  nodeType: 'option';
  value: string;
  text: string;
}

// Description
export interface FormDescription extends BaseNode {
  nodeType: 'description';
  prefix: string;
  text: string;
}

// Warning
export interface FormWarning extends BaseNode {
  nodeType: 'warning';
  text: string;
}

// Note
export interface FormNote extends BaseNode {
  nodeType: 'note';
  text: string;
  isCheckItem: boolean;
}

// Reference (for profilereference)
export interface FormReference extends BaseNode {
  nodeType: 'reference';
  table: string;
  field: ProfileReferenceField;
}

// Answer
export interface FormAnswer extends BaseNode {
  nodeType: 'answer';
  text: string;
  answerDate?: string;
  updateDate?: string;
}

// Question
export interface FormQuestion extends BaseNode {
  nodeType: 'question';
  type: QuestionType;
  format: string;
  option?: string;
  required: boolean;
  triggerValue: string;
  comment: string;
  maxlength: number;
  refname: string;
  appType: string;
  appTypeTrigger: string;
  isAmended: boolean;
  validatorClass: string;
  validationMessage: string;
  ncbeName: string;
  ncbeCurrently: boolean;
  ilgName: string;
  children: (FormDescription | FormOption | FormReference | FormAnswer)[];
}

// Conditional
export interface FormConditional extends BaseNode {
  nodeType: 'conditional';
  condition: 'true' | 'false' | string; // string for switch conditions like ";value1;value2;"
  children: FormNode[];
}

// ConditionSet
export interface FormConditionSet extends BaseNode {
  nodeType: 'conditionset';
  operator: ConditionOperator;
  children: (FormQuestion | FormConditional | FormDescription | FormWarning | FormNote)[];
}

// Entity
export interface FormEntity extends BaseNode {
  nodeType: 'entity';
  title: string;
  type: EntityType;
  min: number;
  max: number;
  nextOrder: number;
  showInBarAdmin: boolean;
  isAmended: boolean;
  groupType: string;
  ncbeName: string;
  ncbeValue: string;
  ilgName: string;
  ilgValue: string;
  children: FormNode[];
}

// IncludeForm
export interface FormIncludeForm extends BaseNode {
  nodeType: 'includeform';
  formName: string;
  title: string;
  type: string;
  multipleInclude: boolean;
  required: boolean;
}

// RequiredDocument
export interface FormRequiredDocument extends BaseNode {
  nodeType: 'required-doc';
  title: string;
  preventSubmit: boolean;
}

// SubSection
export interface FormSubSection extends BaseNode {
  nodeType: 'subsection';
  title: string;
  showInBarAdmin: boolean;
  children: FormNode[];
}

// Section
export interface FormSection extends BaseNode {
  nodeType: 'section';
  title: string;
  showInBarAdmin: boolean;
  children: FormSubSection[];
}

// Questionnaire (Root)
export interface FormQuestionnaire extends BaseNode {
  nodeType: 'questionnaire';
  title: string;
  suffix: string;
  nextId: number;
  children: FormSection[];
}

// Union type for all form nodes
export type FormNode =
  | FormQuestionnaire
  | FormSection
  | FormSubSection
  | FormQuestion
  | FormEntity
  | FormConditionSet
  | FormConditional
  | FormDescription
  | FormWarning
  | FormNote
  | FormOption
  | FormReference
  | FormAnswer
  | FormIncludeForm
  | FormRequiredDocument;

// Question type metadata for UI
export interface QuestionTypeMeta {
  type: QuestionType;
  label: string;
  category: 'text' | 'selection' | 'date' | 'location' | 'special';
  hasOptions: boolean;
  hasFormat: boolean;
  formats?: string[];
  icon: string;
}

export const QUESTION_TYPE_META: QuestionTypeMeta[] = [
  // Text
  { type: 'char', label: 'Text Input', category: 'text', hasOptions: false, hasFormat: true, formats: ['', 'email', 'integer'], icon: 'Type' },
  { type: 'text', label: 'Text Area', category: 'text', hasOptions: false, hasFormat: true, formats: ['', 'large'], icon: 'AlignLeft' },
  { type: 'ssn', label: 'SSN', category: 'text', hasOptions: false, hasFormat: false, icon: 'Hash' },

  // Selection
  { type: 'radio', label: 'Radio Buttons', category: 'selection', hasOptions: true, hasFormat: false, icon: 'Circle' },
  { type: 'radioseperate', label: 'Radio Separate', category: 'selection', hasOptions: true, hasFormat: false, icon: 'CircleDot' },
  { type: 'select', label: 'Dropdown', category: 'selection', hasOptions: true, hasFormat: false, icon: 'ChevronDown' },

  // Date
  { type: 'date', label: 'Date', category: 'date', hasOptions: false, hasFormat: true, formats: ['', 'mm/yy', 'yy', 'mm/dd/yy', 'mm/dd/yyyy', 'present_mm/yy', 'present_mm/dd/yy', 'future_mm/yy', 'future_mm/dd/yy', 'dob_mm/yy', 'dob_mm/dd/yy', 'july_feb', 'mpre_month'], icon: 'Calendar' },
  { type: 'time', label: 'Time', category: 'date', hasOptions: false, hasFormat: false, icon: 'Clock' },
  { type: 'emp_date_start', label: 'Employment Start', category: 'date', hasOptions: false, hasFormat: true, formats: ['mm/yy', 'mm/dd/yy'], icon: 'CalendarPlus' },
  { type: 'emp_date_end', label: 'Employment End', category: 'date', hasOptions: false, hasFormat: true, formats: ['mm/yy', 'present_mm/yy', 'mm/dd/yy', 'present_mm/dd/yy'], icon: 'CalendarMinus' },
  { type: 'res_date_start', label: 'Residence Start', category: 'date', hasOptions: false, hasFormat: true, formats: ['mm/yy', 'mm/dd/yy'], icon: 'CalendarPlus' },
  { type: 'res_date_end', label: 'Residence End', category: 'date', hasOptions: false, hasFormat: true, formats: ['mm/yy', 'present_mm/yy', 'mm/dd/yy', 'present_mm/dd/yy'], icon: 'CalendarMinus' },

  // Location
  { type: 'state', label: 'State', category: 'location', hasOptions: false, hasFormat: true, formats: ['', 'exclude_state', 'exclude_province', 'gov_state'], icon: 'MapPin' },
  { type: 'state_ube', label: 'UBE State', category: 'location', hasOptions: false, hasFormat: false, icon: 'MapPin' },
  { type: 'state_mutual', label: 'Mutual State', category: 'location', hasOptions: false, hasFormat: false, icon: 'MapPin' },
  { type: 'country', label: 'Country', category: 'location', hasOptions: false, hasFormat: false, icon: 'Globe' },
  { type: 'county', label: 'County', category: 'location', hasOptions: false, hasFormat: false, icon: 'Map' },
  { type: 'zip', label: 'ZIP Code', category: 'location', hasOptions: false, hasFormat: false, icon: 'Mail' },

  // Special
  { type: 'lawschool', label: 'Law School', category: 'special', hasOptions: false, hasFormat: true, formats: ['', 'aba', 'all'], icon: 'GraduationCap' },
  { type: 'examsite', label: 'Exam Site', category: 'special', hasOptions: false, hasFormat: false, icon: 'Building' },
  { type: 'signature', label: 'Signature', category: 'special', hasOptions: false, hasFormat: false, icon: 'PenTool' },
  { type: 'profilereference', label: 'Profile Reference', category: 'special', hasOptions: false, hasFormat: false, icon: 'User' },
  { type: 'examreference', label: 'Exam Reference', category: 'special', hasOptions: false, hasFormat: false, icon: 'FileText' },
  { type: 'notice', label: 'Notice', category: 'special', hasOptions: false, hasFormat: false, icon: 'Info' },
];

// Condition operator metadata
export const CONDITION_OPERATORS: { value: ConditionOperator; label: string; description: string }[] = [
  { value: 'and', label: 'AND', description: 'All conditions must be true' },
  { value: 'or', label: 'OR', description: 'At least one condition must be true' },
  { value: 'smaller', label: 'SMALLER', description: 'Date comparison (first < second)' },
  { value: 'switch', label: 'SWITCH', description: 'Multiple value branching' },
  { value: 'contain', label: 'CONTAIN', description: 'String contains check' },
];
