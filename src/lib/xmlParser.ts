import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import {
  FormQuestionnaire,
  FormSubform,
  FormSection,
  FormSubSection,
  FormQuestion,
  FormEntity,
  FormConditionSet,
  FormConditionLogic,
  FormCondition,
  FormConditional,
  FormDescription,
  FormWarning,
  FormNote,
  FormOption,
  FormReference,
  FormIncludeForm,
  FormRequiredDocument,
  FormSimpleText,
  FormValidator,
  FormAnswer,
  FormUnknown,
  FormNode,
  FormRoot,
  QuestionType,
  ConditionOperator,
} from '@/types/form';

// Parser options with preserveOrder to maintain element sequence.
// trimValues MUST stay false: descriptions can contain raw inline HTML
// ("Hello <strong>world</strong>") where inter-element whitespace is meaningful.
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  parseAttributeValue: false,
  trimValues: false,
  preserveOrder: true,
};

// Builder options with preserveOrder
const builderOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  format: true,
  indentBy: '    ',
  suppressEmptyNode: false,
  preserveOrder: true,
};

// Generate unique ID (fallback)
let idCounter = Date.now();
const generateId = (): string => {
  idCounter++;
  return `node_${idCounter}`;
};

// Type for preserveOrder format node
type OrderedNode = {
  ':@'?: Record<string, unknown>;
  [key: string]: unknown;
};

// parseInt that does not fall into the ||-falsy trap (nextorder="0" must stay 0)
const parseIntOr = (value: unknown, fallback: number): number => {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isNaN(n) ? fallback : n;
};

// Get attributes from ordered node
const getAttrs = (node: OrderedNode): Record<string, unknown> => {
  return node[':@'] || {};
};

// Recursively extract text from any value
const extractText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join('');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Check for text content keys
    if ('#cdata' in obj) return extractText(obj['#cdata']);
    if ('#text' in obj) return extractText(obj['#text']);
    // Try to find any string value
    for (const key of Object.keys(obj)) {
      if (!key.startsWith('@_') && !key.startsWith(':')) {
        const result = extractText(obj[key]);
        if (result) return result;
      }
    }
  }
  return '';
};

// Builder used to reconstruct raw inline XML (no re-formatting)
const innerXmlBuilder = () => new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  format: false,
  suppressEmptyNode: false,
  preserveOrder: true,
});

// True when the ordered children contain real element nodes (mixed content)
const hasElementChildren = (children: OrderedNode[]): boolean => {
  if (!children || !Array.isArray(children)) return false;
  return children.some(child => getTagName(child) !== null);
};

// Get text content from ordered node array.
// Pure text/CDATA content is concatenated; mixed content (raw inline HTML like
// "Hello <strong>world</strong>") is reconstructed verbatim so no markup is lost.
const getTextFromOrdered = (children: OrderedNode[]): string => {
  if (!children || !Array.isArray(children)) return '';

  if (hasElementChildren(children)) {
    return innerXmlBuilder().build(children).trim();
  }

  const texts: string[] = [];
  let hasCdata = false;
  for (const child of children) {
    if ('#cdata' in child) {
      hasCdata = true;
      texts.push(extractText(child['#cdata']));
    } else if ('#text' in child) {
      const t = extractText(child['#text']);
      // skip pure indentation around CDATA blocks
      if (t.trim() !== '') texts.push(t);
    }
  }
  const joined = texts.join('');
  return hasCdata ? joined : joined.trim();
};

// Extract original attributes
const extractOriginalAttrs = (attrs: Record<string, unknown>): Record<string, string> => {
  const result: Record<string, string> = {};
  Object.keys(attrs).forEach(key => {
    if (key.startsWith('@_')) {
      const attrName = key.replace('@_', '');
      const value = attrs[key];
      // empty strings are kept: the real corpus is full of attrs like ncbe_name=""
      if (value !== undefined && value !== null) {
        if (value === true) {
          result[attrName] = 'true';
        } else if (value === false) {
          result[attrName] = 'false';
        } else {
          result[attrName] = String(value);
        }
      }
    }
  });
  return result;
};

// Get the tag name from an ordered node
const getTagName = (node: OrderedNode): string | null => {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text' && key !== '#cdata') {
      return key;
    }
  }
  return null;
};

// Parse Description
const parseDescription = (attrs: Record<string, unknown>, children: OrderedNode[]): FormDescription => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'description',
  prefix: String(attrs['@_prefix'] || ''),
  text: getTextFromOrdered(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Warning
const parseWarning = (attrs: Record<string, unknown>, children: OrderedNode[]): FormWarning => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'warning',
  text: getTextFromOrdered(children),
  preventSubmit: attrs['@_preventsubmit'] === 'true',
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Note
const parseNote = (attrs: Record<string, unknown>, children: OrderedNode[]): FormNote => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'note',
  text: getTextFromOrdered(children),
  isCheckItem: attrs['@_ischeckitem'] === 'true',
  prefix: String(attrs['@_prefix'] || ''),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse SimpleText - bare HTML fragment, E-Bar reads only id + text content
const parseSimpleText = (attrs: Record<string, unknown>, children: OrderedNode[]): FormSimpleText => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'simpletext',
  text: getTextFromOrdered(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Validator - standalone validator element
const parseValidator = (attrs: Record<string, unknown>): FormValidator => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'validator',
  validatorClass: String(attrs['@_validatorclass'] || ''),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Answer - applicant answer (present in saved user files)
const parseAnswer = (attrs: Record<string, unknown>, children: OrderedNode[]): FormAnswer => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'answer',
  text: getTextFromOrdered(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Unknown - preserve the raw subtree verbatim so nothing is silently lost
const parseUnknown = (tagName: string, attrs: Record<string, unknown>, child: OrderedNode): FormUnknown => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'unknown',
  tagName,
  raw: structuredClone(child),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Option
const parseOption = (attrs: Record<string, unknown>, children: OrderedNode[]): FormOption => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'option',
  value: String(attrs['@_value'] || ''),
  text: getTextFromOrdered(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Reference (no default for field - E-Bar reads it verbatim)
const parseReference = (attrs: Record<string, unknown>): FormReference => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'reference',
  table: String(attrs['@_table'] || ''),
  field: String(attrs['@_field'] ?? '') as FormReference['field'],
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Question - preserves child order
const parseQuestion = (attrs: Record<string, unknown>, children: OrderedNode[]): FormQuestion => {
  const questionChildren: FormQuestion['children'] = [];

  // Process children in order
  for (const child of children) {
    const childAttrs = getAttrs(child);
    const tagName = getTagName(child);

    if (!tagName) continue;
    if (tagName === 'reference') {
      questionChildren.push(parseReference(childAttrs));
    } else {
      const parsed = parseSingleChild(child);
      if (parsed) questionChildren.push(parsed as FormQuestion['children'][number]);
    }
  }

  return {
    id: String(attrs['@_id'] || generateId()),
    nodeType: 'question',
    type: (attrs['@_type'] || 'char') as QuestionType,
    format: String(attrs['@_format'] || ''),
    option: String(attrs['@_option'] || ''),
    required: attrs['@_required'] === 'true',
    triggerValue: String(attrs['@_triggervalue'] || ''),
    comment: String(attrs['@_comment'] || ''),
    maxlength: parseInt(String(attrs['@_maxlength'] || '0'), 10) || 0,
    refname: String(attrs['@_refname'] || ''),
    appType: String(attrs['@_app_type'] || ''),
    appTypeTrigger: String(attrs['@_app_type_trigger'] || ''),
    isAmended: attrs['@_isamended'] === 'true',
    validatorClass: String(attrs['@_validatorclass'] || ''),
    validationMessage: String(attrs['@_validationmessage'] || ''),
    ncbeName: String(attrs['@_ncbe_name'] || ''),
    ncbeCurrently: attrs['@_ncbe_currently'] === 'true',
    ilgName: String(attrs['@_ilg_name'] || ''),
    children: questionChildren,
    _originalAttrs: extractOriginalAttrs(attrs),
  };
};

// Parse IncludeForm (children carry grafted subform instances in saved user files)
// NOTE: E-Bar's IncludeForm defaults required to TRUE - only required="false" disables it
const parseIncludeForm = (attrs: Record<string, unknown>, children: OrderedNode[] = []): FormIncludeForm => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'includeform',
  formName: String(attrs['@_formname'] || ''),
  title: String(attrs['@_title'] || ''),
  type: String(attrs['@_type'] || 'online'),
  multipleInclude: attrs['@_multipleinclude'] === 'true',
  required: attrs['@_required'] !== 'false',
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse RequiredDocument
const parseRequiredDoc = (attrs: Record<string, unknown>): FormRequiredDocument => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'required-doc',
  title: String(attrs['@_title'] || ''),
  preventSubmit: attrs['@_preventsubmit'] === 'true',
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Condition
const parseCondition = (attrs: Record<string, unknown>): FormCondition => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'condition',
  equals: String(attrs['@_equals'] || 'true'),
  value: String(attrs['@_value'] || ''),
  questionId: String(attrs['@_questionid'] || ''),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Forward declarations
let parseChildren: (children: OrderedNode[]) => FormNode[];
let parseConditional: (attrs: Record<string, unknown>, children: OrderedNode[]) => FormConditional;
let parseConditionSet: (attrs: Record<string, unknown>, children: OrderedNode[]) => FormConditionSet;
let parseConditionLogic: (attrs: Record<string, unknown>, children: OrderedNode[]) => FormConditionLogic;
let parseEntity: (attrs: Record<string, unknown>, children: OrderedNode[]) => FormEntity;

// Parse Conditional
parseConditional = (attrs: Record<string, unknown>, children: OrderedNode[]): FormConditional => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'conditional',
  condition: attrs['@_condition'] ? String(attrs['@_condition']) : 'true',
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse ConditionSet - preserves child order
parseConditionSet = (attrs: Record<string, unknown>, children: OrderedNode[]): FormConditionSet => {
  const csChildren: FormConditionSet['children'] = [];

  for (const child of children) {
    const childAttrs = getAttrs(child);
    const tagName = getTagName(child);

    if (!tagName) continue;
    const parsed = parseSingleChild(child);
    if (parsed) csChildren.push(parsed);
  }

  return {
    id: String(attrs['@_id'] || generateId()),
    nodeType: 'conditionset',
    operator: (attrs['@_operator'] || 'and') as ConditionOperator,
    children: csChildren,
    _originalAttrs: extractOriginalAttrs(attrs),
  };
};

// Parse ConditionLogic
parseConditionLogic = (attrs: Record<string, unknown>, children: OrderedNode[]): FormConditionLogic => {
  const conditions: FormCondition[] = [];
  const clChildren: FormNode[] = [];

  for (const child of children) {
    const childAttrs = getAttrs(child);
    const tagName = getTagName(child);

    if (tagName === 'condition') {
      conditions.push(parseCondition(childAttrs));
    } else if (tagName) {
      // Parse other children using parseChildren logic
      const parsed = parseSingleChild(child);
      if (parsed) clChildren.push(parsed);
    }
  }

  return {
    id: String(attrs['@_id'] || generateId()),
    nodeType: 'conditionlogic',
    operator: (attrs['@_operator'] || 'or') as ConditionOperator,
    conditions,
    children: clChildren,
    _originalAttrs: extractOriginalAttrs(attrs),
  };
};

// Parse Entity
parseEntity = (attrs: Record<string, unknown>, children: OrderedNode[]): FormEntity => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'entity',
  title: String(attrs['@_title'] || ''),
  type: (attrs['@_type'] || 'single') as 'single' | 'addmore',
  min: parseIntOr(attrs['@_min'], 0),
  max: parseIntOr(attrs['@_max'], 0),
  entityOrder: parseIntOr(attrs['@_order'], 0),
  nextOrder: parseIntOr(attrs['@_nextorder'], 1),
  showInBarAdmin: attrs['@_showinbaradmin'] === undefined ? undefined : attrs['@_showinbaradmin'] === 'true',
  isAmended: attrs['@_isamended'] === 'true',
  groupType: String(attrs['@_grouptype'] || ''),
  ncbeName: String(attrs['@_ncbe_name'] || ''),
  ncbeValue: String(attrs['@_ncbe_value'] || ''),
  ilgName: String(attrs['@_ilg_name'] || ''),
  ilgValue: String(attrs['@_ilg_value'] || ''),
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse a single child node
const parseSingleChild = (child: OrderedNode): FormNode | null => {
  const childAttrs = getAttrs(child);
  const tagName = getTagName(child);

  if (!tagName) return null;

  const childContent = child[tagName] as OrderedNode[];

  // Text-bearing elements that contain REAL child elements (e.g. a description
  // wrapping a simpletext with its own CDATA) cannot be flattened to text without
  // corrupting nested CDATA - preserve the whole subtree verbatim instead.
  const TEXT_BEARING = ['description', 'warning', 'note', 'simpletext', 'option', 'answer'];
  if (TEXT_BEARING.includes(tagName) && hasElementChildren(childContent)) {
    return parseUnknown(tagName, childAttrs, child);
  }

  switch (tagName) {
    case 'section':
      return parseSection(childAttrs, childContent);
    case 'subsection':
      return parseSubSection(childAttrs, childContent);
    case 'question':
      return parseQuestion(childAttrs, childContent);
    case 'entity':
      return parseEntity(childAttrs, childContent);
    case 'conditionset':
      return parseConditionSet(childAttrs, childContent);
    case 'conditionlogic':
      return parseConditionLogic(childAttrs, childContent);
    case 'conditional':
      return parseConditional(childAttrs, childContent);
    case 'description':
      return parseDescription(childAttrs, childContent);
    case 'warning':
      return parseWarning(childAttrs, childContent);
    case 'note':
      return parseNote(childAttrs, childContent);
    case 'option':
      return parseOption(childAttrs, childContent);
    case 'reference':
      return parseReference(childAttrs);
    case 'simpletext':
      return parseSimpleText(childAttrs, childContent);
    case 'validator':
      return parseValidator(childAttrs);
    case 'answer':
      return parseAnswer(childAttrs, childContent);
    case 'includeform':
      return parseIncludeForm(childAttrs, childContent);
    case 'required-doc':
      return parseRequiredDoc(childAttrs);
    default:
      // Never silently drop: preserve the raw subtree and re-emit it verbatim
      return parseUnknown(tagName, childAttrs, child);
  }
};

// Parse children (generic) - preserves order
parseChildren = (children: OrderedNode[]): FormNode[] => {
  const result: FormNode[] = [];

  for (const child of children) {
    const parsed = parseSingleChild(child);
    if (parsed) result.push(parsed);
  }

  return result;
};

// Parse SubSection
const parseSubSection = (attrs: Record<string, unknown>, children: OrderedNode[]): FormSubSection => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'subsection',
  title: String(attrs['@_title'] || ''),
  showInBarAdmin: attrs['@_showinbaradmin'] === undefined ? undefined : attrs['@_showinbaradmin'] === 'true',
  depends: attrs['@_depends'] === undefined ? undefined : String(attrs['@_depends']),
  condition: attrs['@_condition'] === undefined ? undefined : String(attrs['@_condition']),
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Section - subsections plus anything else that legitimately sits at section level
const parseSection = (attrs: Record<string, unknown>, children: OrderedNode[]): FormSection => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'section',
  title: String(attrs['@_title'] || ''),
  showInBarAdmin: attrs['@_showinbaradmin'] === undefined ? undefined : attrs['@_showinbaradmin'] === 'true',
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Generate a random 5-digit suffix
const generateSuffix = (): string => {
  return Math.floor(10000 + Math.random() * 90000).toString();
};

// Parse Questionnaire
export const parseXML = (xmlString: string): FormQuestionnaire | null => {
  try {
    const parser = new XMLParser(parserOptions);
    const result = parser.parse(xmlString) as OrderedNode[];

    // Find questionnaire element
    let questionnaireNode: OrderedNode | null = null;
    for (const node of result) {
      if ('questionnaire' in node) {
        questionnaireNode = node;
        break;
      }
    }

    if (!questionnaireNode) {
      console.error('No questionnaire element found');
      return null;
    }

    const attrs = getAttrs(questionnaireNode);
    const children = questionnaireNode['questionnaire'] as OrderedNode[];

    const form: FormQuestionnaire = {
      id: String(attrs['@_id'] || generateId()),
      nodeType: 'questionnaire',
      title: String(attrs['@_title'] || 'Untitled Form'),
      suffix: String(attrs['@_suffix'] || ''),
      nextId: parseInt(String(attrs['@_nextid'] || '1'), 10) || 1,
      children: parseChildren(children),
      _originalAttrs: extractOriginalAttrs(attrs),
    };

    return form;
  } catch (error) {
    console.error('Failed to parse XML:', error);
    return null;
  }
};

// ============================================================================
// SHARED XML BUILDER HELPERS
// These helpers are used by both buildXML and buildSubformXML to avoid DRY
// ============================================================================

// Helper to create ordered node with attributes
const createOrderedNode = (
  tagName: string,
  attrs: Record<string, unknown>,
  children: OrderedNode[] = []
): OrderedNode => {
  const node: OrderedNode = {};
  if (Object.keys(attrs).length > 0) {
    node[':@'] = attrs;
  }
  node[tagName] = children;
  return node;
};

// Helper to merge original attributes with overrides
const mergeAttrs = (
  original: Record<string, string> | undefined,
  overrides: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  // First copy original attributes
  if (original) {
    Object.entries(original).forEach(([key, value]) => {
      if (value === 'true') {
        result[`@_${key}`] = '__BOOL_TRUE__';
      } else if (value === 'false') {
        result[`@_${key}`] = '__BOOL_FALSE__';
      } else {
        result[`@_${key}`] = value;
      }
    });
  }

  // Then apply overrides
  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });

  return result;
};

// Helper for boolean placeholders
const boolPlaceholder = (val: string | boolean | undefined): string => {
  if (val === true || val === 'true') return '__BOOL_TRUE__';
  if (val === false || val === 'false') return '__BOOL_FALSE__';
  return String(val || '');
};

// Optional string attr: emit when non-empty; when the user cleared a previously
// non-empty value, drop the attr so the stale original spelling (already copied
// in by mergeAttrs) doesn't resurface. Empty-string originals are kept verbatim.
const setOptionalAttr = (
  attrs: Record<string, unknown>,
  original: Record<string, string> | undefined,
  name: string,
  value: string | undefined
): void => {
  if (value) {
    attrs[`@_${name}`] = value;
  } else if (original?.[name]) {
    delete attrs[`@_${name}`];
  }
};

// Boolean attr: keep the original spelling when the value is unchanged
// (isamended="" stays ""), emit the corrected value otherwise
const setBoolAttr = (
  attrs: Record<string, unknown>,
  original: Record<string, string> | undefined,
  name: string,
  value: boolean
): void => {
  const orig = original?.[name];
  if (orig !== undefined) {
    if ((orig === 'true') === value) return;
    attrs[`@_${name}`] = value ? '__BOOL_TRUE__' : '__BOOL_FALSE__';
  } else if (value) {
    attrs[`@_${name}`] = '__BOOL_TRUE__';
  }
};

// Override a numeric attribute only when the value actually changed.
// Keeps original spellings like min="" (E-Bar treats it as 0) byte-identical.
const setNumericAttr = (
  attrs: Record<string, unknown>,
  original: Record<string, string> | undefined,
  name: string,
  value: number
): void => {
  const orig = original?.[name];
  if (orig !== undefined && (parseInt(orig, 10) || 0) === (value || 0)) return;
  attrs[`@_${name}`] = String(value || 0);
};

// Helper to create CDATA content in the correct format for preserveOrder mode
const makeCdata = (text: string | undefined | null): OrderedNode[] => {
  const t = text || '';
  if (!t) return [];
  // "]]>" would terminate the CDATA section early and produce malformed XML;
  // the standard fix is splitting into adjacent CDATA sections (parse rejoins them)
  const safe = t.replace(/\]\]>/g, ']]]]><![CDATA[>');
  return [{ '#cdata': [{ '#text': safe }] }];
};

// Build Description node
const buildDescription = (desc: FormDescription): OrderedNode => {
  const attrs = mergeAttrs(desc._originalAttrs, {
    '@_id': desc.id,
    '@_prefix': desc.prefix,
  });
  return createOrderedNode('description', attrs, makeCdata(desc.text));
};

// Build Warning node
const buildWarning = (warning: FormWarning): OrderedNode => {
  const attrs = mergeAttrs(warning._originalAttrs, {
    '@_id': warning.id,
  });
  if (warning.preventSubmit || warning._originalAttrs?.preventsubmit !== undefined) {
    attrs['@_preventsubmit'] = boolPlaceholder(warning.preventSubmit);
  }
  return createOrderedNode('warning', attrs, makeCdata(warning.text));
};

// Build Note node
const buildNote = (note: FormNote): OrderedNode => {
  const attrs = mergeAttrs(note._originalAttrs, {
    '@_id': note.id,
    '@_ischeckitem': String(note.isCheckItem),
  });
  if (note.prefix || note._originalAttrs?.prefix !== undefined) {
    attrs['@_prefix'] = note.prefix;
  }
  return createOrderedNode('note', attrs, makeCdata(note.text));
};

// Build SimpleText node
const buildSimpleText = (st: FormSimpleText): OrderedNode => {
  const attrs = mergeAttrs(st._originalAttrs, {
    '@_id': st.id,
  });
  return createOrderedNode('simpletext', attrs, makeCdata(st.text));
};

// Build Validator node
const buildValidator = (validator: FormValidator): OrderedNode => {
  const attrs = mergeAttrs(validator._originalAttrs, {
    '@_id': validator.id,
    '@_validatorclass': validator.validatorClass,
  });
  return createOrderedNode('validator', attrs, []);
};

// Build Answer node
const buildAnswer = (answer: FormAnswer): OrderedNode => {
  const attrs = mergeAttrs(answer._originalAttrs, {
    '@_id': answer.id,
  });
  return createOrderedNode('answer', attrs, makeCdata(answer.text));
};

// Build Unknown node - re-emit the preserved raw subtree verbatim.
// The pretty-printing builder would re-indent inside the subtree (corrupting
// mixed content), so we emit a placeholder token and splice the verbatim
// serialization into the final string in a post-processing pass.
let rawSubtrees: string[] = [];
const resetRawSubtrees = (): void => { rawSubtrees = []; };
const buildUnknown = (unknown: FormUnknown): OrderedNode | null => {
  if (!unknown.raw) return null;
  const verbatim = innerXmlBuilder().build([structuredClone(unknown.raw)]);
  const token = `__FFRAW_${rawSubtrees.length}__`;
  rawSubtrees.push(verbatim);
  return { '#text': token } as OrderedNode;
};
const spliceRawSubtrees = (xmlContent: string): string => {
  return xmlContent.replace(/__FFRAW_(\d+)__/g, (match, idx) => {
    const raw = rawSubtrees[parseInt(idx, 10)];
    return raw !== undefined ? raw : match;
  });
};

// Build Option node
const buildOption = (option: FormOption): OrderedNode => {
  const attrs = mergeAttrs(option._originalAttrs, {
    '@_id': option.id,
    '@_value': option.value,
  });
  return createOrderedNode('option', attrs, makeCdata(option.text));
};

// Build Reference node
const buildReference = (ref: FormReference): OrderedNode => {
  const attrs = mergeAttrs(ref._originalAttrs, {
    '@_id': ref.id,
    '@_table': ref.table,
    '@_field': ref.field,
  });
  return createOrderedNode('reference', attrs, []);
};

// Build Question node
const buildQuestion = (question: FormQuestion): OrderedNode => {
  // keep original spellings: type="" is a legacy alias of char,
  // required="" is E-Bar's spelling of false
  const typeValue =
    question._originalAttrs?.type === '' && question.type === 'char' ? '' : question.type;
  const requiredValue =
    question._originalAttrs?.required === '' && question.required === false
      ? ''
      : boolPlaceholder(question.required);
  const attrs = mergeAttrs(question._originalAttrs, {
    '@_id': question.id,
    '@_type': typeValue,
    '@_format': question.format,
    '@_required': requiredValue,
    '@_triggervalue': boolPlaceholder(question.triggerValue),
    '@_comment': question.comment || '',
  });

  if (question.maxlength) {
    attrs['@_maxlength'] = String(question.maxlength);
  } else if (parseIntOr(question._originalAttrs?.maxlength, 0) !== 0) {
    delete attrs['@_maxlength'];
  }
  setOptionalAttr(attrs, question._originalAttrs, 'option', question.option);
  setOptionalAttr(attrs, question._originalAttrs, 'refname', question.refname);
  setOptionalAttr(attrs, question._originalAttrs, 'app_type', question.appType);
  setOptionalAttr(attrs, question._originalAttrs, 'app_type_trigger', question.appTypeTrigger);
  setBoolAttr(attrs, question._originalAttrs, 'isamended', question.isAmended);
  setOptionalAttr(attrs, question._originalAttrs, 'validatorclass', question.validatorClass);
  setOptionalAttr(attrs, question._originalAttrs, 'validationmessage', question.validationMessage);
  setOptionalAttr(attrs, question._originalAttrs, 'ncbe_name', question.ncbeName);
  setBoolAttr(attrs, question._originalAttrs, 'ncbe_currently', question.ncbeCurrently);
  setOptionalAttr(attrs, question._originalAttrs, 'ilg_name', question.ilgName);

  // Build children in order
  const children: OrderedNode[] = [];
  for (const child of (question.children || [])) {
    const built = buildNode(child as FormNode);
    if (built) children.push(built);
  }

  return createOrderedNode('question', attrs, children);
};

// Build Condition node
const buildCondition = (cond: FormCondition): OrderedNode | null => {
  if (!cond) return null;
  const attrs = mergeAttrs(cond._originalAttrs, {
    '@_id': cond.id,
    '@_equals': boolPlaceholder(cond.equals),
    '@_value': cond.value || '',
    '@_questionid': cond.questionId || '',
  });
  return createOrderedNode('condition', attrs, []);
};

// Build generic node (recursive)
const buildNode = (node: FormNode): OrderedNode | null => {
  if (!node) return null;
  switch (node.nodeType) {
    case 'section':
      return buildSection(node as FormSection);
    case 'subsection':
      return buildSubSection(node as FormSubSection);
    case 'description':
      return buildDescription(node as FormDescription);
    case 'warning':
      return buildWarning(node as FormWarning);
    case 'note':
      return buildNote(node as FormNote);
    case 'simpletext':
      return buildSimpleText(node as FormSimpleText);
    case 'validator':
      return buildValidator(node as FormValidator);
    case 'answer':
      return buildAnswer(node as FormAnswer);
    case 'unknown':
      return buildUnknown(node as FormUnknown);
    case 'option':
      return buildOption(node as FormOption);
    case 'reference':
      return buildReference(node as FormReference);
    case 'condition':
      return buildCondition(node as FormCondition);
    case 'question':
      return buildQuestion(node as FormQuestion);
    case 'entity': {
      const entity = node as FormEntity;
      const attrs = mergeAttrs(entity._originalAttrs, {
        '@_id': entity.id,
        '@_title': entity.title,
      });
      // keep original spelling type="" (E-Bar treats it as single)
      const origType = entity._originalAttrs?.type;
      if (!(origType !== undefined && (origType === entity.type || (origType === '' && entity.type === 'single')))) {
        attrs['@_type'] = entity.type;
      }
      setNumericAttr(attrs, entity._originalAttrs, 'min', entity.min);
      setNumericAttr(attrs, entity._originalAttrs, 'max', entity.max);
      // order/nextorder drive E-Bar's add-more bookkeeping; emit whenever the
      // original had them, the values are non-default, or the entity repeats
      if (entity._originalAttrs?.order !== undefined || entity.entityOrder !== 0 || entity.type === 'addmore') {
        attrs['@_order'] = String(entity.entityOrder ?? 0);
      }
      if (entity._originalAttrs?.nextorder !== undefined || entity.nextOrder !== 1 || entity.type === 'addmore') {
        attrs['@_nextorder'] = String(entity.nextOrder ?? 1);
      }
      if (entity.showInBarAdmin !== undefined) {
        attrs['@_showinbaradmin'] = boolPlaceholder(entity.showInBarAdmin);
      }
      setBoolAttr(attrs, entity._originalAttrs, 'isamended', entity.isAmended);
      setOptionalAttr(attrs, entity._originalAttrs, 'grouptype', entity.groupType);
      setOptionalAttr(attrs, entity._originalAttrs, 'ncbe_name', entity.ncbeName);
      setOptionalAttr(attrs, entity._originalAttrs, 'ncbe_value', entity.ncbeValue);
      setOptionalAttr(attrs, entity._originalAttrs, 'ilg_name', entity.ilgName);
      setOptionalAttr(attrs, entity._originalAttrs, 'ilg_value', entity.ilgValue);

      const children: OrderedNode[] = [];
      for (const child of (entity.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('entity', attrs, children);
    }
    case 'conditionset': {
      const cs = node as FormConditionSet;
      const attrs = mergeAttrs(cs._originalAttrs, {
        '@_id': cs.id,
        '@_operator': cs.operator,
      });
      const children: OrderedNode[] = [];
      for (const child of (cs.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('conditionset', attrs, children);
    }
    case 'conditionlogic': {
      const cl = node as FormConditionLogic;
      const attrs = mergeAttrs(cl._originalAttrs, {
        '@_id': cl.id,
        '@_operator': cl.operator,
      });
      const children: OrderedNode[] = [];
      // Add conditions first
      if (cl.conditions) {
        for (const cond of cl.conditions) {
          const built = buildCondition(cond);
          if (built) children.push(built);
        }
      }
      // Add other children
      for (const child of (cl.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('conditionlogic', attrs, children);
    }
    case 'conditional': {
      const cond = node as FormConditional;
      const attrs = mergeAttrs(cond._originalAttrs, {
        '@_id': cond.id,
        '@_condition': cond.condition || 'true',
      });
      const children: OrderedNode[] = [];
      for (const child of (cond.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('conditional', attrs, children);
    }
    case 'includeform': {
      const inc = node as FormIncludeForm;
      const attrs = mergeAttrs(inc._originalAttrs, {
        '@_id': inc.id,
        '@_formname': inc.formName,
        '@_type': inc.type,
      });
      if (inc.title || inc._originalAttrs?.title !== undefined) {
        attrs['@_title'] = inc.title;
      }
      // defaults per E-Bar: multipleinclude=false, required=true; emit only when
      // the original carried the attr or the value is non-default
      if (inc.multipleInclude || inc._originalAttrs?.multipleinclude !== undefined) {
        attrs['@_multipleinclude'] = boolPlaceholder(inc.multipleInclude);
      }
      if (!inc.required || inc._originalAttrs?.required !== undefined) {
        attrs['@_required'] = boolPlaceholder(inc.required);
      }
      const children: OrderedNode[] = [];
      for (const child of (inc.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('includeform', attrs, children);
    }
    case 'required-doc': {
      const doc = node as FormRequiredDocument;
      const attrs = mergeAttrs(doc._originalAttrs, {
        '@_id': doc.id,
        '@_title': doc.title,
        '@_preventsubmit': boolPlaceholder(doc.preventSubmit),
      });
      return createOrderedNode('required-doc', attrs, []);
    }
    default:
      return null;
  }
};

// Build SubSection node
const buildSubSection = (subsection: FormSubSection): OrderedNode => {
  const attrs = mergeAttrs(subsection._originalAttrs, {
    '@_id': subsection.id,
    '@_title': subsection.title,
  });
  if (subsection.showInBarAdmin !== undefined) {
    attrs['@_showinbaradmin'] = boolPlaceholder(subsection.showInBarAdmin);
  }
  // cleared depends/condition must not resurface from _originalAttrs
  if (subsection.depends !== undefined) {
    attrs['@_depends'] = subsection.depends;
  } else if (subsection._originalAttrs?.depends !== undefined) {
    delete attrs['@_depends'];
  }
  if (subsection.condition !== undefined) {
    attrs['@_condition'] = boolPlaceholder(subsection.condition);
  } else if (subsection._originalAttrs?.condition !== undefined) {
    delete attrs['@_condition'];
  }
  const children: OrderedNode[] = [];
  for (const child of (subsection.children || [])) {
    const built = buildNode(child);
    if (built) children.push(built);
  }
  return createOrderedNode('subsection', attrs, children);
};

// Build Section node
const buildSection = (section: FormSection): OrderedNode => {
  const attrs = mergeAttrs(section._originalAttrs, {
    '@_id': section.id,
    '@_title': section.title,
  });
  if (section.showInBarAdmin !== undefined) {
    attrs['@_showinbaradmin'] = boolPlaceholder(section.showInBarAdmin);
  }
  const children: OrderedNode[] = [];
  for (const child of (section.children || [])) {
    const built = buildNode(child);
    if (built) children.push(built);
  }
  return createOrderedNode('section', attrs, children);
};

// Post-process XML to fix boolean placeholders
const fixBooleanPlaceholders = (xmlContent: string): string => {
  return xmlContent
    .replace(/__BOOL_TRUE__/g, 'true')
    .replace(/__BOOL_FALSE__/g, 'false');
};

// Placeholder fix-ups run only OUTSIDE CDATA sections so user text that
// happens to contain a literal token can never be corrupted. Bool fix runs
// before the raw splice so preserved-verbatim subtrees are never touched.
const postProcessPlaceholders = (xmlContent: string): string =>
  xmlContent
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part, i) => (i % 2 === 1 ? part : spliceRawSubtrees(fixBooleanPlaceholders(part))))
    .join('');

// ============================================================================
// PUBLIC BUILD FUNCTIONS
// ============================================================================

// Build XML from form (questionnaire)
export const buildXML = (form: FormQuestionnaire): string => {
  resetRawSubtrees();
  const builder = new XMLBuilder(builderOptions);

  // Build questionnaire
  const questionnaireAttrs = mergeAttrs(form._originalAttrs, {
    '@_id': form.id,
    '@_nextid': String(form.nextId),
    '@_suffix': form.suffix,
    '@_title': form.title,
  });

  const sectionNodes: OrderedNode[] = [];
  for (const child of (form.children || [])) {
    const built = buildNode(child);
    if (built) sectionNodes.push(built);
  }

  const xmlObj: OrderedNode[] = [
    createOrderedNode('questionnaire', questionnaireAttrs, sectionNodes),
  ];

  const xmlContent = postProcessPlaceholders(builder.build(xmlObj));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlContent}`;
};

// Create empty form
export const createEmptyForm = (title: string = 'New Form', customSuffix?: string): FormQuestionnaire => {
  const suffix = customSuffix || generateSuffix();
  return {
    id: `1${suffix}`,
    nodeType: 'questionnaire',
    title,
    suffix,
    nextId: 2,
    children: [],
  };
};

// Parse Subform XML
export const parseSubformXML = (xmlString: string): FormSubform | null => {
  try {
    const parser = new XMLParser(parserOptions);
    const result = parser.parse(xmlString) as OrderedNode[];

    // Find subform element
    let subformNode: OrderedNode | null = null;
    for (const node of result) {
      if ('subform' in node) {
        subformNode = node;
        break;
      }
    }

    if (!subformNode) {
      console.error('No subform element found');
      return null;
    }

    const attrs = getAttrs(subformNode);
    const children = subformNode['subform'] as OrderedNode[];

    const form: FormSubform = {
      id: String(attrs['@_id'] || generateId()),
      nodeType: 'subform',
      title: String(attrs['@_title'] || 'Untitled Subform'),
      suffix: String(attrs['@_suffix'] || ''),
      nextId: parseInt(String(attrs['@_nextid'] || '1'), 10) || 1,
      children: parseChildren(children),
      _originalAttrs: extractOriginalAttrs(attrs),
    };

    return form;
  } catch (error) {
    console.error('Failed to parse Subform XML:', error);
    return null;
  }
};

// Build Subform XML - now uses shared helpers
export const buildSubformXML = (form: FormSubform): string => {
  resetRawSubtrees();
  const builder = new XMLBuilder(builderOptions);

  // Build subform
  const subformAttrs = mergeAttrs(form._originalAttrs, {
    '@_id': form.id,
    '@_nextid': String(form.nextId),
    '@_suffix': form.suffix,
    '@_order': '0',
    '@_title': form.title,
  });

  const childNodes: OrderedNode[] = [];
  for (const child of (form.children || [])) {
    const built = buildNode(child);
    if (built) childNodes.push(built);
  }

  const xmlObj: OrderedNode[] = [
    createOrderedNode('subform', subformAttrs, childNodes),
  ];

  const xmlContent = postProcessPlaceholders(builder.build(xmlObj));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlContent}`;
};

// Create empty subform
export const createEmptySubform = (title: string = 'New Subform', customSuffix?: string): FormSubform => {
  const suffix = customSuffix || generateSuffix();
  return {
    id: `1${suffix}`,
    nodeType: 'subform',
    title,
    suffix,
    nextId: 2,
    children: [],
  };
};

// Detect XML type (questionnaire or subform)
export const detectXMLType = (xmlString: string): 'questionnaire' | 'subform' | null => {
  try {
    const parser = new XMLParser(parserOptions);
    const result = parser.parse(xmlString) as OrderedNode[];

    for (const node of result) {
      if ('questionnaire' in node) return 'questionnaire';
      if ('subform' in node) return 'subform';
    }
    return null;
  } catch {
    return null;
  }
};

// Parse any XML (auto-detect type)
export const parseAnyXML = (xmlString: string): FormRoot | null => {
  const type = detectXMLType(xmlString);
  if (type === 'questionnaire') return parseXML(xmlString);
  if (type === 'subform') return parseSubformXML(xmlString);
  return null;
};

// Build any form XML (auto-detect type)
export const buildAnyXML = (form: FormRoot): string => {
  if (form.nodeType === 'questionnaire') return buildXML(form);
  if (form.nodeType === 'subform') return buildSubformXML(form);
  return '';
};
