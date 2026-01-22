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

// Profile Reference Fields (from Reference.java)
export type ProfileReferenceField =
  // Names
  | 'fullname'
  | 'fullnamesandbox'
  | 'salutaionfullname'
  | 'firstname'
  | 'middlename'
  | 'lastname'
  | 'suffix'
  | 'title'
  // Identity
  | 'ssn'
  | 'ssn_last_four'
  | 'ssn_dmv'
  | 'dob'
  | 'sex'
  // Place of Birth
  | 'pob'
  | 'pob_city'
  | 'pob_state'
  | 'pob_state_code'
  | 'pob_country'
  | 'place_of_birth'
  // Address
  | 'addresstype'
  | 'address1'
  | 'address2'
  | 'city'
  | 'state'
  | 'zip'
  | 'county'
  | 'country'
  | 'fulladdress'
  // Physical Address
  | 'phy_address_1'
  | 'phy_address_2'
  | 'phy_city'
  | 'phy_state'
  | 'phy_zip'
  | 'phy_county'
  | 'phy_country'
  // Contact
  | 'email'
  | 'primaryphone'
  | 'cellphone'
  | 'phone_office'
  | 'fax'
  | 'othernumber'
  // Professional
  | 'firmname'
  | 'ncbe_number'
  | 'wsbanumber'
  | 'barcodeno'
  | 'license_name'
  | 'interview_county'
  | 'mbe_state'
  // Law School
  | 'abbreviated_lawschool'
  | 'foreignlawschool'
  | 'nonabalawschool'
  // Exam Info
  | 'examfirstday'
  | 'examfirstdaydate'
  | 'examsecondday'
  | 'examseconddaydate'
  | 'exammonth'
  | 'exammonthbig'
  | 'examyear'
  | 'prevexamyear'
  | 'prevexammonth'
  | 'examcertificateday'
  | 'examcertificatemonthday'
  | 'mbemonthdaydate'
  | 'mbeyeardate'
  // Application
  | 'currentdeadline'
  | 'currentfee'
  // Special
  | 'today'
  | 'ubeoctnj'
  // GA FEA
  | 'ga_fea_q1'
  | 'ga_fea_q2'
  | 'ga_fea_q3'
  | 'ga_fea_foreign_law_school'
  | 'ga_fea_foreign_jurisdiction'
  | 'ga_fea_law_school'
  // WA specific
  | 'business_title'
  | 'entity_role'
  | 'entity_role_finance';

// Profile Reference Field options for UI
export const PROFILE_REFERENCE_FIELDS: { value: ProfileReferenceField; label: string; category: string }[] = [
  // Names
  { value: 'fullname', label: 'Full Name', category: 'Name' },
  { value: 'firstname', label: 'First Name', category: 'Name' },
  { value: 'middlename', label: 'Middle Name', category: 'Name' },
  { value: 'lastname', label: 'Last Name', category: 'Name' },
  { value: 'suffix', label: 'Suffix', category: 'Name' },
  { value: 'title', label: 'Title/Salutation', category: 'Name' },
  { value: 'salutaionfullname', label: 'Salutation + Full Name', category: 'Name' },
  { value: 'fullnamesandbox', label: 'Full Name (No Suffix)', category: 'Name' },
  // Identity
  { value: 'ssn', label: 'SSN', category: 'Identity' },
  { value: 'ssn_last_four', label: 'SSN (Last 4)', category: 'Identity' },
  { value: 'ssn_dmv', label: 'SSN + DMV', category: 'Identity' },
  { value: 'dob', label: 'Date of Birth', category: 'Identity' },
  { value: 'sex', label: 'Gender', category: 'Identity' },
  // Place of Birth
  { value: 'place_of_birth', label: 'Place of Birth', category: 'Birth' },
  { value: 'pob', label: 'POB (Legacy)', category: 'Birth' },
  { value: 'pob_city', label: 'POB City', category: 'Birth' },
  { value: 'pob_state', label: 'POB State', category: 'Birth' },
  { value: 'pob_state_code', label: 'POB State Code', category: 'Birth' },
  { value: 'pob_country', label: 'POB Country', category: 'Birth' },
  // Address
  { value: 'addresstype', label: 'Address Type', category: 'Address' },
  { value: 'address1', label: 'Address Line 1', category: 'Address' },
  { value: 'address2', label: 'Address Line 2', category: 'Address' },
  { value: 'city', label: 'City', category: 'Address' },
  { value: 'state', label: 'State', category: 'Address' },
  { value: 'zip', label: 'ZIP Code', category: 'Address' },
  { value: 'county', label: 'County', category: 'Address' },
  { value: 'country', label: 'Country', category: 'Address' },
  { value: 'fulladdress', label: 'Full Address', category: 'Address' },
  // Physical Address
  { value: 'phy_address_1', label: 'Physical Address 1', category: 'Physical Address' },
  { value: 'phy_address_2', label: 'Physical Address 2', category: 'Physical Address' },
  { value: 'phy_city', label: 'Physical City', category: 'Physical Address' },
  { value: 'phy_state', label: 'Physical State', category: 'Physical Address' },
  { value: 'phy_zip', label: 'Physical ZIP', category: 'Physical Address' },
  { value: 'phy_county', label: 'Physical County', category: 'Physical Address' },
  { value: 'phy_country', label: 'Physical Country', category: 'Physical Address' },
  // Contact
  { value: 'email', label: 'Email', category: 'Contact' },
  { value: 'primaryphone', label: 'Primary Phone', category: 'Contact' },
  { value: 'cellphone', label: 'Cell Phone', category: 'Contact' },
  { value: 'phone_office', label: 'Office Phone', category: 'Contact' },
  { value: 'fax', label: 'Fax', category: 'Contact' },
  { value: 'othernumber', label: 'Other Number', category: 'Contact' },
  // Professional
  { value: 'firmname', label: 'Firm Name', category: 'Professional' },
  { value: 'ncbe_number', label: 'NCBE Number', category: 'Professional' },
  { value: 'wsbanumber', label: 'WSBA Number', category: 'Professional' },
  { value: 'barcodeno', label: 'Barcode No', category: 'Professional' },
  { value: 'license_name', label: 'License Name', category: 'Professional' },
  { value: 'interview_county', label: 'Interview County', category: 'Professional' },
  { value: 'mbe_state', label: 'MBE State', category: 'Professional' },
  // Law School
  { value: 'abbreviated_lawschool', label: 'Law School (Abbreviated)', category: 'Education' },
  { value: 'foreignlawschool', label: 'Foreign Law School', category: 'Education' },
  { value: 'nonabalawschool', label: 'Non-ABA Law School', category: 'Education' },
  // Exam Info
  { value: 'examfirstday', label: 'Exam First Day', category: 'Exam' },
  { value: 'examfirstdaydate', label: 'Exam First Day (Date)', category: 'Exam' },
  { value: 'examsecondday', label: 'Exam Second Day', category: 'Exam' },
  { value: 'examseconddaydate', label: 'Exam Second Day (Date)', category: 'Exam' },
  { value: 'exammonth', label: 'Exam Month', category: 'Exam' },
  { value: 'exammonthbig', label: 'Exam Month (Uppercase)', category: 'Exam' },
  { value: 'examyear', label: 'Exam Year', category: 'Exam' },
  { value: 'prevexamyear', label: 'Previous Exam Year', category: 'Exam' },
  { value: 'prevexammonth', label: 'Previous Exam Month', category: 'Exam' },
  { value: 'examcertificateday', label: 'Exam Certificate Day', category: 'Exam' },
  { value: 'examcertificatemonthday', label: 'Exam Certificate Month/Day', category: 'Exam' },
  // Application
  { value: 'currentdeadline', label: 'Current Deadline', category: 'Application' },
  { value: 'currentfee', label: 'Current Fee', category: 'Application' },
  // Special
  { value: 'today', label: 'Today\'s Date', category: 'Special' },
];

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
  { type: 'profilereference', label: 'Profile Reference', category: 'special', hasOptions: false, hasFormat: true, formats: ['fullname', 'firstname', 'middlename', 'lastname', 'suffix', 'title', 'ssn', 'ssn_last_four', 'dob', 'sex', 'place_of_birth', 'pob_city', 'pob_state', 'pob_country', 'addresstype', 'address1', 'address2', 'city', 'state', 'zip', 'county', 'country', 'fulladdress', 'email', 'primaryphone', 'cellphone', 'phone_office', 'fax', 'firmname', 'ncbe_number', 'abbreviated_lawschool', 'examfirstday', 'examsecondday', 'exammonth', 'examyear', 'currentdeadline', 'currentfee', 'today'], icon: 'User' },
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
