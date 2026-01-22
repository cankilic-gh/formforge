import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import {
  FormQuestionnaire,
  FormSection,
  FormSubSection,
  FormQuestion,
  FormEntity,
  FormConditionSet,
  FormConditional,
  FormDescription,
  FormWarning,
  FormNote,
  FormOption,
  FormReference,
  FormIncludeForm,
  FormRequiredDocument,
  FormNode,
  QuestionType,
  ConditionOperator,
} from '@/types/form';

// Parser options
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  parseAttributeValue: false,
  trimValues: true,
};

// Builder options
const builderOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  format: true,
  indentBy: '    ',
  suppressEmptyNode: false,
};

// Helper to ensure array
const ensureArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

// Helper to get text content
const getText = (node: Record<string, unknown>): string => {
  if (typeof node === 'string') return node;
  if (node['#cdata']) return String(node['#cdata']);
  if (node['#text']) return String(node['#text']);
  return '';
};

// Generate unique ID
let idCounter = Date.now();
const generateId = (): string => {
  idCounter++;
  return `node_${idCounter}`;
};

// Parse Description
const parseDescription = (node: Record<string, unknown>): FormDescription => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'description',
  prefix: String(node['@_prefix'] || ''),
  text: getText(node),
});

// Parse Warning
const parseWarning = (node: Record<string, unknown>): FormWarning => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'warning',
  text: getText(node),
});

// Parse Note
const parseNote = (node: Record<string, unknown>): FormNote => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'note',
  text: getText(node),
  isCheckItem: node['@_ischeckitem'] === 'true',
});

// Parse Option
const parseOption = (node: Record<string, unknown>): FormOption => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'option',
  value: String(node['@_value'] || ''),
  text: getText(node),
});

// Parse Reference
const parseReference = (node: Record<string, unknown>): FormReference => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'reference',
  table: String(node['@_table'] || ''),
  field: (node['@_field'] || 'fullname') as FormReference['field'],
});

// Parse Question
const parseQuestion = (node: Record<string, unknown>): FormQuestion => {
  const children: FormQuestion['children'] = [];

  // Parse description
  ensureArray(node['description'] as Record<string, unknown>[]).forEach((d) => {
    children.push(parseDescription(d));
  });

  // Parse options
  ensureArray(node['option'] as Record<string, unknown>[]).forEach((o) => {
    children.push(parseOption(o));
  });

  // Parse reference
  ensureArray(node['reference'] as Record<string, unknown>[]).forEach((r) => {
    children.push(parseReference(r));
  });

  return {
    id: String(node['@_id'] || generateId()),
    nodeType: 'question',
    type: (node['@_type'] || 'char') as QuestionType,
    format: String(node['@_format'] || ''),
    option: String(node['@_option'] || ''),
    required: node['@_required'] === 'true',
    triggerValue: String(node['@_triggervalue'] || ''),
    comment: String(node['@_comment'] || ''),
    maxlength: parseInt(String(node['@_maxlength'] || '0'), 10) || 0,
    refname: String(node['@_refname'] || ''),
    appType: String(node['@_app_type'] || ''),
    appTypeTrigger: String(node['@_app_type_trigger'] || ''),
    isAmended: node['@_isamended'] === 'true',
    validatorClass: String(node['@_validatorclass'] || ''),
    validationMessage: String(node['@_validationmessage'] || ''),
    ncbeName: String(node['@_ncbe_name'] || ''),
    ncbeCurrently: node['@_ncbe_currently'] === 'true',
    ilgName: String(node['@_ilg_name'] || ''),
    children,
  };
};

// Parse IncludeForm
const parseIncludeForm = (node: Record<string, unknown>): FormIncludeForm => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'includeform',
  formName: String(node['@_formname'] || ''),
  title: String(node['@_title'] || ''),
  type: String(node['@_type'] || 'online'),
  multipleInclude: node['@_multipleinclude'] === 'true',
  required: node['@_required'] === 'true',
});

// Parse RequiredDocument
const parseRequiredDoc = (node: Record<string, unknown>): FormRequiredDocument => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'required-doc',
  title: String(node['@_title'] || ''),
  preventSubmit: node['@_preventsubmit'] === 'true',
});

// Parse Conditional
const parseConditional = (node: Record<string, unknown>): FormConditional => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'conditional',
  condition: String(node['@_condition'] || 'true'),
  children: parseChildren(node),
});

// Parse ConditionSet
const parseConditionSet = (node: Record<string, unknown>): FormConditionSet => {
  const children: FormConditionSet['children'] = [];

  // Parse questions
  ensureArray(node['question'] as Record<string, unknown>[]).forEach((q) => {
    children.push(parseQuestion(q));
  });

  // Parse conditionals
  ensureArray(node['conditional'] as Record<string, unknown>[]).forEach((c) => {
    children.push(parseConditional(c));
  });

  // Parse descriptions
  ensureArray(node['description'] as Record<string, unknown>[]).forEach((d) => {
    children.push(parseDescription(d));
  });

  // Parse warnings
  ensureArray(node['warning'] as Record<string, unknown>[]).forEach((w) => {
    children.push(parseWarning(w));
  });

  // Parse notes
  ensureArray(node['note'] as Record<string, unknown>[]).forEach((n) => {
    children.push(parseNote(n));
  });

  return {
    id: String(node['@_id'] || generateId()),
    nodeType: 'conditionset',
    operator: (node['@_operator'] || 'and') as ConditionOperator,
    children,
  };
};

// Parse Entity
const parseEntity = (node: Record<string, unknown>): FormEntity => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'entity',
  title: String(node['@_title'] || ''),
  type: (node['@_type'] || 'single') as 'single' | 'addmore',
  min: parseInt(String(node['@_min'] || '0'), 10) || 0,
  max: parseInt(String(node['@_max'] || '0'), 10) || 0,
  nextOrder: parseInt(String(node['@_nextorder'] || '1'), 10) || 1,
  showInBarAdmin: node['@_showinbaradmin'] !== 'false',
  isAmended: node['@_isamended'] === 'true',
  groupType: String(node['@_grouptype'] || ''),
  ncbeName: String(node['@_ncbe_name'] || ''),
  ncbeValue: String(node['@_ncbe_value'] || ''),
  ilgName: String(node['@_ilg_name'] || ''),
  ilgValue: String(node['@_ilg_value'] || ''),
  children: parseChildren(node),
});

// Parse children (generic)
const parseChildren = (node: Record<string, unknown>): FormNode[] => {
  const children: FormNode[] = [];

  // Questions
  ensureArray(node['question'] as Record<string, unknown>[]).forEach((q) => {
    children.push(parseQuestion(q));
  });

  // Entities
  ensureArray(node['entity'] as Record<string, unknown>[]).forEach((e) => {
    children.push(parseEntity(e));
  });

  // ConditionSets
  ensureArray(node['conditionset'] as Record<string, unknown>[]).forEach((cs) => {
    children.push(parseConditionSet(cs));
  });

  // Descriptions
  ensureArray(node['description'] as Record<string, unknown>[]).forEach((d) => {
    children.push(parseDescription(d));
  });

  // Warnings
  ensureArray(node['warning'] as Record<string, unknown>[]).forEach((w) => {
    children.push(parseWarning(w));
  });

  // Notes
  ensureArray(node['note'] as Record<string, unknown>[]).forEach((n) => {
    children.push(parseNote(n));
  });

  // IncludeForms
  ensureArray(node['includeform'] as Record<string, unknown>[]).forEach((i) => {
    children.push(parseIncludeForm(i));
  });

  // RequiredDocs
  ensureArray(node['required-doc'] as Record<string, unknown>[]).forEach((r) => {
    children.push(parseRequiredDoc(r));
  });

  return children;
};

// Parse SubSection
const parseSubSection = (node: Record<string, unknown>): FormSubSection => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'subsection',
  title: String(node['@_title'] || ''),
  showInBarAdmin: node['@_showinbaradmin'] !== 'false',
  children: parseChildren(node),
});

// Parse Section
const parseSection = (node: Record<string, unknown>): FormSection => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'section',
  title: String(node['@_title'] || ''),
  showInBarAdmin: node['@_showinbaradmin'] !== 'false',
  children: ensureArray(node['subsection'] as Record<string, unknown>[]).map(parseSubSection),
});

// Parse Questionnaire
export const parseXML = (xmlString: string): FormQuestionnaire | null => {
  try {
    const parser = new XMLParser(parserOptions);
    const result = parser.parse(xmlString);

    const questionnaire = result['questionnaire'];
    if (!questionnaire) {
      console.error('No questionnaire element found');
      return null;
    }

    return {
      id: String(questionnaire['@_id'] || generateId()),
      nodeType: 'questionnaire',
      title: String(questionnaire['@_title'] || 'Untitled Form'),
      suffix: String(questionnaire['@_suffix'] || ''),
      nextId: parseInt(String(questionnaire['@_nextid'] || '1'), 10) || 1,
      children: ensureArray(questionnaire['section'] as Record<string, unknown>[]).map(parseSection),
    };
  } catch (error) {
    console.error('Failed to parse XML:', error);
    return null;
  }
};

// Build XML from form
export const buildXML = (form: FormQuestionnaire): string => {
  const builder = new XMLBuilder(builderOptions);

  const buildDescription = (desc: FormDescription) => ({
    '@_id': desc.id,
    '@_prefix': desc.prefix,
    '#cdata': desc.text,
  });

  const buildWarning = (warning: FormWarning) => ({
    '@_id': warning.id,
    '#cdata': warning.text,
  });

  const buildNote = (note: FormNote) => ({
    '@_id': note.id,
    '@_ischeckitem': String(note.isCheckItem),
    '#cdata': note.text,
  });

  const buildOption = (option: FormOption) => ({
    '@_id': option.id,
    '@_value': option.value,
    '#cdata': option.text,
  });

  const buildReference = (ref: FormReference) => ({
    '@_id': ref.id,
    '@_table': ref.table,
    '@_field': ref.field,
  });

  const buildQuestion = (question: FormQuestion) => {
    const result: Record<string, unknown> = {
      '@_id': question.id,
      '@_type': question.type,
      '@_format': question.format,
      '@_required': String(question.required),
      '@_triggervalue': question.triggerValue,
      '@_comment': question.comment,
    };

    if (question.maxlength) result['@_maxlength'] = String(question.maxlength);
    if (question.option) result['@_option'] = question.option;
    if (question.refname) result['@_refname'] = question.refname;
    if (question.appType) result['@_app_type'] = question.appType;
    if (question.appTypeTrigger) result['@_app_type_trigger'] = question.appTypeTrigger;
    if (question.isAmended) result['@_isamended'] = 'true';
    if (question.validatorClass) result['@_validatorclass'] = question.validatorClass;
    if (question.validationMessage) result['@_validationmessage'] = question.validationMessage;
    if (question.ncbeName) result['@_ncbe_name'] = question.ncbeName;
    if (question.ncbeCurrently) result['@_ncbe_currently'] = 'true';
    if (question.ilgName) result['@_ilg_name'] = question.ilgName;

    const descriptions = question.children.filter((c) => c.nodeType === 'description');
    const options = question.children.filter((c) => c.nodeType === 'option');
    const references = question.children.filter((c) => c.nodeType === 'reference');

    if (descriptions.length) result['description'] = descriptions.map(buildDescription);
    if (options.length) result['option'] = options.map(buildOption);
    if (references.length) result['reference'] = references.map(buildReference);

    return result;
  };

  const buildNode = (node: FormNode): Record<string, unknown> | null => {
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
        const result: Record<string, unknown> = {
          '@_id': entity.id,
          '@_title': entity.title,
          '@_type': entity.type,
          '@_min': String(entity.min),
          '@_max': String(entity.max),
          '@_showinbaradmin': String(entity.showInBarAdmin),
        };
        if (entity.groupType) result['@_grouptype'] = entity.groupType;
        if (entity.ncbeName) result['@_ncbe_name'] = entity.ncbeName;
        if (entity.ncbeValue) result['@_ncbe_value'] = entity.ncbeValue;
        if (entity.ilgName) result['@_ilg_name'] = entity.ilgName;
        if (entity.ilgValue) result['@_ilg_value'] = entity.ilgValue;

        addChildrenToResult(result, entity.children);
        return result;
      }
      case 'conditionset': {
        const cs = node as FormConditionSet;
        const result: Record<string, unknown> = {
          '@_id': cs.id,
          '@_operator': cs.operator,
        };
        addChildrenToResult(result, cs.children);
        return result;
      }
      case 'conditional': {
        const cond = node as FormConditional;
        const result: Record<string, unknown> = {
          '@_id': cond.id,
          '@_condition': cond.condition,
        };
        addChildrenToResult(result, cond.children);
        return result;
      }
      case 'includeform': {
        const inc = node as FormIncludeForm;
        return {
          '@_id': inc.id,
          '@_formname': inc.formName,
          '@_title': inc.title,
          '@_type': inc.type,
          '@_multipleinclude': String(inc.multipleInclude),
          '@_required': String(inc.required),
        };
      }
      case 'required-doc': {
        const doc = node as FormRequiredDocument;
        return {
          '@_id': doc.id,
          '@_title': doc.title,
          '@_preventsubmit': String(doc.preventSubmit),
        };
      }
      default:
        return null;
    }
  };

  const addChildrenToResult = (result: Record<string, unknown>, children: FormNode[]) => {
    const grouped: Record<string, unknown[]> = {};

    children.forEach((child) => {
      const built = buildNode(child);
      if (built) {
        const key = child.nodeType === 'required-doc' ? 'required-doc' : child.nodeType;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(built);
      }
    });

    Object.entries(grouped).forEach(([key, values]) => {
      result[key] = values;
    });
  };

  const buildSubSection = (subsection: FormSubSection) => {
    const result: Record<string, unknown> = {
      '@_id': subsection.id,
      '@_title': subsection.title,
      '@_showinbaradmin': String(subsection.showInBarAdmin),
    };
    addChildrenToResult(result, subsection.children);
    return result;
  };

  const buildSection = (section: FormSection) => ({
    '@_id': section.id,
    '@_title': section.title,
    '@_showinbaradmin': String(section.showInBarAdmin),
    subsection: section.children.map(buildSubSection),
  });

  const xmlObj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    questionnaire: {
      '@_id': form.id,
      '@_nextid': String(form.nextId),
      '@_suffix': form.suffix,
      '@_order': '0',
      '@_title': form.title,
      section: form.children.map(buildSection),
    },
  };

  return builder.build(xmlObj);
};

// Generate a random 5-digit suffix for new forms
const generateSuffix = (): string => {
  return Math.floor(10000 + Math.random() * 90000).toString();
};

// Create empty form
// ID format: nextId + suffix (e.g., 1 + 00001 = 100001)
export const createEmptyForm = (title: string = 'New Form'): FormQuestionnaire => {
  const suffix = generateSuffix();
  return {
    id: `1${suffix}`, // Questionnaire gets ID 1, so 1 + suffix
    nodeType: 'questionnaire',
    title,
    suffix,
    nextId: 2, // Next item will be 2 + suffix = 2xxxxx
    children: [],
  };
};
