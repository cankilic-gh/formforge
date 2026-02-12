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
  FormNode,
  FormRoot,
  QuestionType,
  ConditionOperator,
} from '@/types/form';

// Parser options with preserveOrder to maintain element sequence
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  parseAttributeValue: false,
  trimValues: true,
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

// Get text content from ordered node array
const getTextFromOrdered = (children: OrderedNode[]): string => {
  if (!children || !Array.isArray(children)) return '';

  const texts: string[] = [];
  for (const child of children) {
    if ('#cdata' in child) {
      texts.push(extractText(child['#cdata']));
    } else if ('#text' in child) {
      texts.push(extractText(child['#text']));
    }
  }
  return texts.filter(Boolean).join('');
};

// Extract original attributes
const extractOriginalAttrs = (attrs: Record<string, unknown>): Record<string, string> => {
  const result: Record<string, string> = {};
  Object.keys(attrs).forEach(key => {
    if (key.startsWith('@_')) {
      const attrName = key.replace('@_', '');
      const value = attrs[key];
      if (value !== undefined && value !== null && value !== '') {
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
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Note
const parseNote = (attrs: Record<string, unknown>, children: OrderedNode[]): FormNote => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'note',
  text: getTextFromOrdered(children),
  isCheckItem: attrs['@_ischeckitem'] === 'true',
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

// Parse Reference
const parseReference = (attrs: Record<string, unknown>): FormReference => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'reference',
  table: String(attrs['@_table'] || ''),
  field: (attrs['@_field'] || 'fullname') as FormReference['field'],
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Question - preserves child order
const parseQuestion = (attrs: Record<string, unknown>, children: OrderedNode[]): FormQuestion => {
  const questionChildren: FormQuestion['children'] = [];

  // Process children in order
  for (const child of children) {
    const childAttrs = getAttrs(child);
    const tagName = getTagName(child);

    if (tagName === 'description') {
      questionChildren.push(parseDescription(childAttrs, child[tagName] as OrderedNode[]));
    } else if (tagName === 'option') {
      questionChildren.push(parseOption(childAttrs, child[tagName] as OrderedNode[]));
    } else if (tagName === 'reference') {
      questionChildren.push(parseReference(childAttrs));
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

// Parse IncludeForm
const parseIncludeForm = (attrs: Record<string, unknown>): FormIncludeForm => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'includeform',
  formName: String(attrs['@_formname'] || ''),
  title: String(attrs['@_title'] || ''),
  type: String(attrs['@_type'] || 'online'),
  multipleInclude: attrs['@_multipleinclude'] === 'true',
  required: attrs['@_required'] === 'true',
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
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse ConditionSet - preserves child order
parseConditionSet = (attrs: Record<string, unknown>, children: OrderedNode[]): FormConditionSet => {
  const csChildren: FormConditionSet['children'] = [];

  for (const child of children) {
    const childAttrs = getAttrs(child);
    const tagName = getTagName(child);

    if (tagName === 'question') {
      csChildren.push(parseQuestion(childAttrs, child[tagName] as OrderedNode[]));
    } else if (tagName === 'conditional') {
      csChildren.push(parseConditional(childAttrs, child[tagName] as OrderedNode[]));
    } else if (tagName === 'description') {
      csChildren.push(parseDescription(childAttrs, child[tagName] as OrderedNode[]));
    } else if (tagName === 'warning') {
      csChildren.push(parseWarning(childAttrs, child[tagName] as OrderedNode[]));
    } else if (tagName === 'note') {
      csChildren.push(parseNote(childAttrs, child[tagName] as OrderedNode[]));
    }
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
  min: parseInt(String(attrs['@_min'] || '0'), 10) || 0,
  max: parseInt(String(attrs['@_max'] || '0'), 10) || 0,
  nextOrder: parseInt(String(attrs['@_nextorder'] || '1'), 10) || 1,
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

  switch (tagName) {
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
    case 'includeform':
      return parseIncludeForm(childAttrs);
    case 'required-doc':
      return parseRequiredDoc(childAttrs);
    default:
      return null;
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
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Section
const parseSection = (attrs: Record<string, unknown>, children: OrderedNode[]): FormSection => {
  const subsections: FormSubSection[] = [];

  for (const child of children) {
    const childAttrs = getAttrs(child);
    const tagName = getTagName(child);

    if (tagName === 'subsection') {
      subsections.push(parseSubSection(childAttrs, child[tagName] as OrderedNode[]));
    }
  }

  return {
    id: String(attrs['@_id'] || generateId()),
    nodeType: 'section',
    title: String(attrs['@_title'] || ''),
    children: subsections,
    _originalAttrs: extractOriginalAttrs(attrs),
  };
};

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

    // Parse sections
    const sections: FormSection[] = [];
    for (const child of children) {
      const childAttrs = getAttrs(child);
      const tagName = getTagName(child);

      if (tagName === 'section') {
        sections.push(parseSection(childAttrs, child[tagName] as OrderedNode[]));
      }
    }

    const form: FormQuestionnaire = {
      id: String(attrs['@_id'] || generateId()),
      nodeType: 'questionnaire',
      title: String(attrs['@_title'] || 'Untitled Form'),
      suffix: String(attrs['@_suffix'] || ''),
      nextId: parseInt(String(attrs['@_nextid'] || '1'), 10) || 1,
      children: sections,
      _originalAttrs: extractOriginalAttrs(attrs),
    };

    return form;
  } catch (error) {
    console.error('Failed to parse XML:', error);
    return null;
  }
};

// Build XML from form
export const buildXML = (form: FormQuestionnaire): string => {
  const builder = new XMLBuilder(builderOptions);

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

  // Helper to create CDATA content in the correct format for preserveOrder mode
  const makeCdata = (text: string | undefined | null): OrderedNode[] => {
    const t = text || '';
    if (!t) return [];
    return [{ '#cdata': [{ '#text': t }] }];
  };

  const buildDescription = (desc: FormDescription): OrderedNode => {
    const attrs = mergeAttrs(desc._originalAttrs, {
      '@_id': desc.id,
      '@_prefix': desc.prefix,
    });
    return createOrderedNode('description', attrs, makeCdata(desc.text));
  };

  const buildWarning = (warning: FormWarning): OrderedNode => {
    const attrs = mergeAttrs(warning._originalAttrs, {
      '@_id': warning.id,
    });
    return createOrderedNode('warning', attrs, makeCdata(warning.text));
  };

  const buildNote = (note: FormNote): OrderedNode => {
    const attrs = mergeAttrs(note._originalAttrs, {
      '@_id': note.id,
      '@_ischeckitem': String(note.isCheckItem),
    });
    return createOrderedNode('note', attrs, makeCdata(note.text));
  };

  const buildOption = (option: FormOption): OrderedNode => {
    const attrs = mergeAttrs(option._originalAttrs, {
      '@_id': option.id,
      '@_value': option.value,
    });
    return createOrderedNode('option', attrs, makeCdata(option.text));
  };

  const buildReference = (ref: FormReference): OrderedNode => {
    const attrs = mergeAttrs(ref._originalAttrs, {
      '@_id': ref.id,
      '@_table': ref.table,
      '@_field': ref.field,
    });
    return createOrderedNode('reference', attrs, []);
  };

  const buildQuestion = (question: FormQuestion): OrderedNode => {
    const attrs = mergeAttrs(question._originalAttrs, {
      '@_id': question.id,
      '@_type': question.type,
      '@_format': question.format,
      '@_required': boolPlaceholder(question.required),
      '@_triggervalue': boolPlaceholder(question.triggerValue),
      '@_comment': question.comment || '',
    });

    if (question.maxlength) attrs['@_maxlength'] = String(question.maxlength);
    if (question.option) attrs['@_option'] = question.option;
    if (question.refname) attrs['@_refname'] = question.refname;
    if (question.appType) attrs['@_app_type'] = question.appType;
    if (question.appTypeTrigger) attrs['@_app_type_trigger'] = question.appTypeTrigger;
    if (question.isAmended) attrs['@_isamended'] = '__BOOL_TRUE__';
    if (question.validatorClass) attrs['@_validatorclass'] = question.validatorClass;
    if (question.validationMessage) attrs['@_validationmessage'] = question.validationMessage;
    if (question.ncbeName) attrs['@_ncbe_name'] = question.ncbeName;
    if (question.ncbeCurrently) attrs['@_ncbe_currently'] = '__BOOL_TRUE__';
    if (question.ilgName) attrs['@_ilg_name'] = question.ilgName;

    // Build children in order
    const children: OrderedNode[] = [];
    for (const child of (question.children || [])) {
      if (child.nodeType === 'description') {
        children.push(buildDescription(child as FormDescription));
      } else if (child.nodeType === 'option') {
        children.push(buildOption(child as FormOption));
      } else if (child.nodeType === 'reference') {
        children.push(buildReference(child as FormReference));
      }
    }

    return createOrderedNode('question', attrs, children);
  };

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

  const buildNode = (node: FormNode): OrderedNode | null => {
    if (!node) return null;
    switch (node.nodeType) {
      case 'description':
        return buildDescription(node as FormDescription);
      case 'warning':
        return buildWarning(node as FormWarning);
      case 'note':
        return buildNote(node as FormNote);
      case 'question':
        return buildQuestion(node as FormQuestion);
      case 'entity': {
        const entity = node as FormEntity;
        const attrs = mergeAttrs(entity._originalAttrs, {
          '@_id': entity.id,
          '@_title': entity.title,
          '@_type': entity.type,
          '@_min': String(entity.min || 0),
          '@_max': String(entity.max || 0),
        });
        if (entity.groupType) attrs['@_grouptype'] = entity.groupType;
        if (entity.ncbeName) attrs['@_ncbe_name'] = entity.ncbeName;
        if (entity.ncbeValue) attrs['@_ncbe_value'] = entity.ncbeValue;
        if (entity.ilgName) attrs['@_ilg_name'] = entity.ilgName;
        if (entity.ilgValue) attrs['@_ilg_value'] = entity.ilgValue;

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
          '@_title': inc.title,
          '@_type': inc.type,
          '@_multipleinclude': boolPlaceholder(inc.multipleInclude),
          '@_required': boolPlaceholder(inc.required),
        });
        return createOrderedNode('includeform', attrs, []);
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

  const buildSubSection = (subsection: FormSubSection): OrderedNode => {
    const attrs = mergeAttrs(subsection._originalAttrs, {
      '@_id': subsection.id,
      '@_title': subsection.title,
    });
    const children: OrderedNode[] = [];
    for (const child of (subsection.children || [])) {
      const built = buildNode(child);
      if (built) children.push(built);
    }
    return createOrderedNode('subsection', attrs, children);
  };

  const buildSection = (section: FormSection): OrderedNode => {
    const attrs = mergeAttrs(section._originalAttrs, {
      '@_id': section.id,
      '@_title': section.title,
    });
    const children: OrderedNode[] = [];
    for (const sub of (section.children || [])) {
      children.push(buildSubSection(sub));
    }
    return createOrderedNode('section', attrs, children);
  };

  // Build questionnaire
  const questionnaireAttrs = mergeAttrs(form._originalAttrs, {
    '@_id': form.id,
    '@_nextid': String(form.nextId),
    '@_suffix': form.suffix,
    '@_title': form.title,
  });

  const sectionNodes: OrderedNode[] = [];
  for (const section of (form.children || [])) {
    sectionNodes.push(buildSection(section));
  }

  const xmlObj: OrderedNode[] = [
    createOrderedNode('questionnaire', questionnaireAttrs, sectionNodes),
  ];

  const xmlContent = builder.build(xmlObj);
  const fixedXml = xmlContent
    .replace(/__BOOL_TRUE__/g, 'true')
    .replace(/__BOOL_FALSE__/g, 'false');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${fixedXml}`;
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

// Build Subform XML
export const buildSubformXML = (form: FormSubform): string => {
  const builder = new XMLBuilder(builderOptions);

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

    Object.entries(overrides).forEach(([key, value]) => {
      if (value !== undefined) {
        result[key] = value;
      }
    });

    return result;
  };

  const boolPlaceholder = (val: string | boolean | undefined): string => {
    if (val === true || val === 'true') return '__BOOL_TRUE__';
    if (val === false || val === 'false') return '__BOOL_FALSE__';
    return String(val || '');
  };

  // Helper to create CDATA content in the correct format for preserveOrder mode
  const makeCdata = (text: string | undefined | null): OrderedNode[] => {
    const t = text || '';
    if (!t) return [];
    return [{ '#cdata': [{ '#text': t }] }];
  };

  const buildDescription = (desc: FormDescription): OrderedNode => {
    const attrs = mergeAttrs(desc._originalAttrs, {
      '@_id': desc.id,
      '@_prefix': desc.prefix,
    });
    return createOrderedNode('description', attrs, makeCdata(desc.text));
  };

  const buildWarning = (warning: FormWarning): OrderedNode => {
    const attrs = mergeAttrs(warning._originalAttrs, {
      '@_id': warning.id,
    });
    return createOrderedNode('warning', attrs, makeCdata(warning.text));
  };

  const buildNote = (note: FormNote): OrderedNode => {
    const attrs = mergeAttrs(note._originalAttrs, {
      '@_id': note.id,
      '@_ischeckitem': String(note.isCheckItem),
    });
    return createOrderedNode('note', attrs, makeCdata(note.text));
  };

  const buildOption = (option: FormOption): OrderedNode => {
    const attrs = mergeAttrs(option._originalAttrs, {
      '@_id': option.id,
      '@_value': option.value,
    });
    return createOrderedNode('option', attrs, makeCdata(option.text));
  };

  const buildReference = (ref: FormReference): OrderedNode => {
    const attrs = mergeAttrs(ref._originalAttrs, {
      '@_id': ref.id,
      '@_table': ref.table,
      '@_field': ref.field,
    });
    return createOrderedNode('reference', attrs, []);
  };

  const buildQuestion = (question: FormQuestion): OrderedNode => {
    const attrs = mergeAttrs(question._originalAttrs, {
      '@_id': question.id,
      '@_type': question.type,
      '@_format': question.format,
      '@_required': boolPlaceholder(question.required),
      '@_triggervalue': boolPlaceholder(question.triggerValue),
      '@_comment': question.comment || '',
    });

    if (question.maxlength) attrs['@_maxlength'] = String(question.maxlength);
    if (question.option) attrs['@_option'] = question.option;
    if (question.refname) attrs['@_refname'] = question.refname;
    if (question.appType) attrs['@_app_type'] = question.appType;
    if (question.appTypeTrigger) attrs['@_app_type_trigger'] = question.appTypeTrigger;
    if (question.isAmended) attrs['@_isamended'] = '__BOOL_TRUE__';
    if (question.validatorClass) attrs['@_validatorclass'] = question.validatorClass;
    if (question.validationMessage) attrs['@_validationmessage'] = question.validationMessage;
    if (question.ncbeName) attrs['@_ncbe_name'] = question.ncbeName;
    if (question.ncbeCurrently) attrs['@_ncbe_currently'] = '__BOOL_TRUE__';
    if (question.ilgName) attrs['@_ilg_name'] = question.ilgName;

    const children: OrderedNode[] = [];
    for (const child of (question.children || [])) {
      if (child.nodeType === 'description') {
        children.push(buildDescription(child as FormDescription));
      } else if (child.nodeType === 'option') {
        children.push(buildOption(child as FormOption));
      } else if (child.nodeType === 'reference') {
        children.push(buildReference(child as FormReference));
      }
    }

    return createOrderedNode('question', attrs, children);
  };

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

  const buildNode = (node: FormNode): OrderedNode | null => {
    if (!node) return null;
    switch (node.nodeType) {
      case 'description':
        return buildDescription(node as FormDescription);
      case 'warning':
        return buildWarning(node as FormWarning);
      case 'note':
        return buildNote(node as FormNote);
      case 'question':
        return buildQuestion(node as FormQuestion);
      case 'entity': {
        const entity = node as FormEntity;
        const attrs = mergeAttrs(entity._originalAttrs, {
          '@_id': entity.id,
          '@_title': entity.title,
          '@_type': entity.type,
          '@_min': String(entity.min || ''),
          '@_max': String(entity.max || ''),
        });
        if (entity.groupType) attrs['@_grouptype'] = entity.groupType;
        if (entity.ncbeName) attrs['@_ncbe_name'] = entity.ncbeName;
        if (entity.ncbeValue) attrs['@_ncbe_value'] = entity.ncbeValue;
        if (entity.ilgName) attrs['@_ilg_name'] = entity.ilgName;
        if (entity.ilgValue) attrs['@_ilg_value'] = entity.ilgValue;

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
        if (cl.conditions) {
          for (const cond of cl.conditions) {
            const built = buildCondition(cond);
            if (built) children.push(built);
          }
        }
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
          '@_title': inc.title,
          '@_type': inc.type,
          '@_multipleinclude': boolPlaceholder(inc.multipleInclude),
          '@_required': boolPlaceholder(inc.required),
        });
        return createOrderedNode('includeform', attrs, []);
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

  const xmlContent = builder.build(xmlObj);
  const fixedXml = xmlContent
    .replace(/__BOOL_TRUE__/g, 'true')
    .replace(/__BOOL_FALSE__/g, 'false');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${fixedXml}`;
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
