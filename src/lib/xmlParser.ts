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

// Extract original attributes from parsed node
const extractOriginalAttrs = (node: Record<string, unknown>): Record<string, string> => {
  const attrs: Record<string, string> = {};
  Object.keys(node).forEach(key => {
    if (key.startsWith('@_')) {
      const attrName = key.replace('@_', '');
      const value = node[key];
      // Store all non-empty values, including booleans
      if (value !== undefined && value !== null && value !== '') {
        // Handle boolean values (fast-xml-parser converts "true"/"false" strings to booleans)
        if (value === true) {
          attrs[attrName] = 'true';
        } else if (value === false) {
          attrs[attrName] = 'false';
        } else {
          attrs[attrName] = String(value);
        }
      }
    }
  });
  return attrs;
};

// Parse Description
const parseDescription = (node: Record<string, unknown>): FormDescription => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'description',
  prefix: String(node['@_prefix'] || ''),
  text: getText(node),
  _originalAttrs: extractOriginalAttrs(node),
});

// Parse Warning
const parseWarning = (node: Record<string, unknown>): FormWarning => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'warning',
  text: getText(node),
  _originalAttrs: extractOriginalAttrs(node),
});

// Parse Note
const parseNote = (node: Record<string, unknown>): FormNote => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'note',
  text: getText(node),
  isCheckItem: node['@_ischeckitem'] === 'true',
  _originalAttrs: extractOriginalAttrs(node),
});

// Parse Option
const parseOption = (node: Record<string, unknown>): FormOption => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'option',
  value: String(node['@_value'] || ''),
  text: getText(node),
  _originalAttrs: extractOriginalAttrs(node),
});

// Parse Reference
const parseReference = (node: Record<string, unknown>): FormReference => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'reference',
  table: String(node['@_table'] || ''),
  field: (node['@_field'] || 'fullname') as FormReference['field'],
  _originalAttrs: extractOriginalAttrs(node),
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
    _originalAttrs: extractOriginalAttrs(node),
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
  _originalAttrs: extractOriginalAttrs(node),
});

// Parse RequiredDocument
const parseRequiredDoc = (node: Record<string, unknown>): FormRequiredDocument => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'required-doc',
  title: String(node['@_title'] || ''),
  preventSubmit: node['@_preventsubmit'] === 'true',
  _originalAttrs: extractOriginalAttrs(node),
});

// Parse Conditional
const parseConditional = (node: Record<string, unknown>): FormConditional => {
  const result: FormConditional = {
    id: String(node['@_id'] || generateId()),
    nodeType: 'conditional',
    children: parseChildren(node),
    _originalAttrs: extractOriginalAttrs(node),
  };
  return result;
};

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
    _originalAttrs: extractOriginalAttrs(node),
  };
};

// Parse Condition (used in conditionlogic)
const parseCondition = (node: Record<string, unknown>): FormCondition => ({
  id: String(node['@_id'] || generateId()),
  nodeType: 'condition',
  equals: String(node['@_equals'] || 'true'),
  value: String(node['@_value'] || ''),
  questionId: String(node['@_questionid'] || ''),
  _originalAttrs: extractOriginalAttrs(node),
});

// Parse ConditionLogic
const parseConditionLogic = (node: Record<string, unknown>): FormConditionLogic => {
  // Parse condition elements
  const conditions = ensureArray(node['condition'] as Record<string, unknown>[]).map(parseCondition);

  // Parse other children (entities, questions, etc.) - skip 'condition' as they're handled separately
  const nodeWithoutConditions = { ...node };
  delete nodeWithoutConditions['condition'];
  const children = parseChildren(nodeWithoutConditions);

  return {
    id: String(node['@_id'] || generateId()),
    nodeType: 'conditionlogic',
    operator: (node['@_operator'] || 'or') as ConditionOperator,
    conditions,
    children,
    _originalAttrs: extractOriginalAttrs(node),
  };
};

// Parse Entity
const parseEntity = (node: Record<string, unknown>): FormEntity => {
  return {
    id: String(node['@_id'] || generateId()),
    nodeType: 'entity',
    title: String(node['@_title'] || ''),
    type: (node['@_type'] || 'single') as 'single' | 'addmore',
    min: parseInt(String(node['@_min'] || '0'), 10) || 0,
    max: parseInt(String(node['@_max'] || '0'), 10) || 0,
    nextOrder: parseInt(String(node['@_nextorder'] || '1'), 10) || 1,
    isAmended: node['@_isamended'] === 'true',
    groupType: String(node['@_grouptype'] || ''),
    ncbeName: String(node['@_ncbe_name'] || ''),
    ncbeValue: String(node['@_ncbe_value'] || ''),
    ilgName: String(node['@_ilg_name'] || ''),
    ilgValue: String(node['@_ilg_value'] || ''),
    children: parseChildren(node),
    _originalAttrs: extractOriginalAttrs(node),
  };
};

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

  // ConditionLogic (used in subforms)
  ensureArray(node['conditionlogic'] as Record<string, unknown>[]).forEach((cl) => {
    children.push(parseConditionLogic(cl));
  });

  // Conditionals (can also appear at this level)
  ensureArray(node['conditional'] as Record<string, unknown>[]).forEach((c) => {
    children.push(parseConditional(c));
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
const parseSubSection = (node: Record<string, unknown>): FormSubSection => {
  return {
    id: String(node['@_id'] || generateId()),
    nodeType: 'subsection',
    title: String(node['@_title'] || ''),
    children: parseChildren(node),
    _originalAttrs: extractOriginalAttrs(node),
  };
};

// Parse Section
const parseSection = (node: Record<string, unknown>): FormSection => {
  return {
    id: String(node['@_id'] || generateId()),
    nodeType: 'section',
    title: String(node['@_title'] || ''),
    children: ensureArray(node['subsection'] as Record<string, unknown>[]).map(parseSubSection),
    _originalAttrs: extractOriginalAttrs(node),
  };
};

// Regenerate all IDs in the form tree with sequential IDs
const regenerateAllIds = (form: FormQuestionnaire): void => {
  const suffix = form.suffix || generateSuffix();
  let nextId = 2; // Start from 2, questionnaire gets 1

  // Update questionnaire ID
  form.id = `1${suffix}`;
  form.suffix = suffix;

  // Recursive function to regenerate IDs
  const regenerate = (node: FormNode): void => {
    if (node.nodeType !== 'questionnaire') {
      node.id = `${nextId}${suffix}`;
      nextId++;
    }

    if ('children' in node && Array.isArray(node.children)) {
      node.children.forEach((child) => regenerate(child as FormNode));
    }
  };

  // Regenerate for all children
  form.children.forEach((section) => {
    regenerate(section);
  });

  // Update nextId in form
  form.nextId = nextId;
};

// Generate a random 5-digit suffix
const generateSuffix = (): string => {
  return Math.floor(10000 + Math.random() * 90000).toString();
};

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

    const form: FormQuestionnaire = {
      id: String(questionnaire['@_id'] || generateId()),
      nodeType: 'questionnaire',
      title: String(questionnaire['@_title'] || 'Untitled Form'),
      suffix: String(questionnaire['@_suffix'] || ''),
      nextId: parseInt(String(questionnaire['@_nextid'] || '1'), 10) || 1,
      children: ensureArray(questionnaire['section'] as Record<string, unknown>[]).map(parseSection),
      _originalAttrs: extractOriginalAttrs(questionnaire),
    };

    // Auto-regenerate all IDs to ensure uniqueness
    regenerateAllIds(form);

    return form;
  } catch (error) {
    console.error('Failed to parse XML:', error);
    return null;
  }
};

// Build XML from form
export const buildXML = (form: FormQuestionnaire): string => {
  const builder = new XMLBuilder(builderOptions);

  // Helper to build with original attributes preserved
  const buildWithOriginalAttrs = (node: { _originalAttrs?: Record<string, string> }, overrides: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    // First copy original attributes (preserve unknown attributes)
    if (node._originalAttrs) {
      Object.entries(node._originalAttrs).forEach(([key, value]) => {
        // Handle 'true' and 'false' string values with placeholders
        if (value === 'true') {
          result[`@_${key}`] = '__BOOL_TRUE__';
        } else if (value === 'false') {
          result[`@_${key}`] = '__BOOL_FALSE__';
        } else {
          result[`@_${key}`] = value;
        }
      });
    }

    // Then apply overrides (our known fields)
    Object.entries(overrides).forEach(([key, value]) => {
      if (value !== undefined) {
        result[key] = value;
      }
    });

    return result;
  };

  const buildDescription = (desc: FormDescription) => buildWithOriginalAttrs(desc, {
    '@_id': desc.id,
    '@_prefix': desc.prefix,
    '#cdata': desc.text,
  });

  const buildWarning = (warning: FormWarning) => buildWithOriginalAttrs(warning, {
    '@_id': warning.id,
    '#cdata': warning.text,
  });

  const buildNote = (note: FormNote) => buildWithOriginalAttrs(note, {
    '@_id': note.id,
    '@_ischeckitem': String(note.isCheckItem),
    '#cdata': note.text,
  });

  const buildOption = (option: FormOption) => buildWithOriginalAttrs(option, {
    '@_id': option.id,
    '@_value': option.value,
    '#cdata': option.text,
  });

  const buildReference = (ref: FormReference) => buildWithOriginalAttrs(ref, {
    '@_id': ref.id,
    '@_table': ref.table,
    '@_field': ref.field,
  });

  const buildQuestion = (question: FormQuestion) => {
    const overrides: Record<string, unknown> = {
      '@_id': question.id,
      '@_type': question.type,
      '@_format': question.format,
      '@_required': question.required === true ? '__BOOL_TRUE__' : '__BOOL_FALSE__',
      '@_triggervalue': question.triggerValue || '',
      '@_comment': question.comment || '',
    };

    if (question.maxlength) overrides['@_maxlength'] = String(question.maxlength);
    if (question.option) overrides['@_option'] = question.option;
    if (question.refname) overrides['@_refname'] = question.refname;
    if (question.appType) overrides['@_app_type'] = question.appType;
    if (question.appTypeTrigger) overrides['@_app_type_trigger'] = question.appTypeTrigger;
    if (question.isAmended) overrides['@_isamended'] = '__BOOL_TRUE__';
    if (question.validatorClass) overrides['@_validatorclass'] = question.validatorClass;
    if (question.validationMessage) overrides['@_validationmessage'] = question.validationMessage;
    if (question.ncbeName) overrides['@_ncbe_name'] = question.ncbeName;
    if (question.ncbeCurrently) overrides['@_ncbe_currently'] = '__BOOL_TRUE__';
    if (question.ilgName) overrides['@_ilg_name'] = question.ilgName;

    const result = buildWithOriginalAttrs(question, overrides);

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
        const overrides: Record<string, unknown> = {
          '@_id': entity.id,
          '@_title': entity.title,
          '@_type': entity.type,
          '@_min': String(entity.min || 0),
          '@_max': String(entity.max || 0),
        };
        if (entity.groupType) overrides['@_grouptype'] = entity.groupType;
        if (entity.ncbeName) overrides['@_ncbe_name'] = entity.ncbeName;
        if (entity.ncbeValue) overrides['@_ncbe_value'] = entity.ncbeValue;
        if (entity.ilgName) overrides['@_ilg_name'] = entity.ilgName;
        if (entity.ilgValue) overrides['@_ilg_value'] = entity.ilgValue;

        const result = buildWithOriginalAttrs(entity, overrides);
        addChildrenToResult(result, entity.children);
        return result;
      }
      case 'conditionset': {
        const cs = node as FormConditionSet;
        const result = buildWithOriginalAttrs(cs, {
          '@_id': cs.id,
          '@_operator': cs.operator,
        });
        addChildrenToResult(result, cs.children);
        return result;
      }
      case 'conditionlogic': {
        const cl = node as FormConditionLogic;
        const result = buildWithOriginalAttrs(cl, {
          '@_id': cl.id,
          '@_operator': cl.operator,
        });
        // Add condition elements
        if (cl.conditions && cl.conditions.length > 0) {
          result['condition'] = cl.conditions.map((c) => buildWithOriginalAttrs(c, {
            '@_id': c.id,
            '@_equals': c.equals,
            '@_value': c.value,
            '@_questionid': c.questionId,
          }));
        }
        // Add other children
        addChildrenToResult(result, cl.children);
        return result;
      }
      case 'condition': {
        const cond = node as FormCondition;
        return buildWithOriginalAttrs(cond, {
          '@_id': cond.id,
          '@_equals': cond.equals,
          '@_value': cond.value,
          '@_questionid': cond.questionId,
        });
      }
      case 'conditional': {
        const cond = node as FormConditional;
        const result = buildWithOriginalAttrs(cond, {
          '@_id': cond.id,
        });
        addChildrenToResult(result, cond.children);
        return result;
      }
      case 'includeform': {
        const inc = node as FormIncludeForm;
        return buildWithOriginalAttrs(inc, {
          '@_id': inc.id,
          '@_formname': inc.formName,
          '@_title': inc.title,
          '@_type': inc.type,
          '@_multipleinclude': inc.multipleInclude ? '__BOOL_TRUE__' : '__BOOL_FALSE__',
          '@_required': inc.required ? '__BOOL_TRUE__' : '__BOOL_FALSE__',
        });
      }
      case 'required-doc': {
        const doc = node as FormRequiredDocument;
        return buildWithOriginalAttrs(doc, {
          '@_id': doc.id,
          '@_title': doc.title,
          '@_preventsubmit': doc.preventSubmit ? '__BOOL_TRUE__' : '__BOOL_FALSE__',
        });
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
    const result = buildWithOriginalAttrs(subsection, {
      '@_id': subsection.id,
      '@_title': subsection.title,
    });
    addChildrenToResult(result, subsection.children);
    return result;
  };

  const buildSection = (section: FormSection) => {
    const result = buildWithOriginalAttrs(section, {
      '@_id': section.id,
      '@_title': section.title,
    });
    result['subsection'] = section.children.map(buildSubSection);
    return result;
  };

  // Build questionnaire with original attributes preserved
  const questionnaireAttrs = buildWithOriginalAttrs(form, {
    '@_id': form.id,
    '@_nextid': String(form.nextId),
    '@_suffix': form.suffix,
    '@_title': form.title,
  });
  questionnaireAttrs['section'] = form.children.map(buildSection);

  const xmlObj = {
    questionnaire: questionnaireAttrs,
  };

  const xmlContent = builder.build(xmlObj);
  // Replace placeholders with actual values (fast-xml-parser treats 'true'/'false' as boolean attributes)
  const fixedXml = xmlContent
    .replace(/__BOOL_TRUE__/g, 'true')
    .replace(/__BOOL_FALSE__/g, 'false');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${fixedXml}`;
};

// Create empty form
// ID format: nextId + suffix (e.g., 1 + 00001 = 100001)
export const createEmptyForm = (title: string = 'New Form', customSuffix?: string): FormQuestionnaire => {
  const suffix = customSuffix || generateSuffix();
  return {
    id: `1${suffix}`, // Questionnaire gets ID 1, so 1 + suffix
    nodeType: 'questionnaire',
    title,
    suffix,
    nextId: 2, // Next item will be 2 + suffix = 2xxxxx
    children: [],
  };
};

// Regenerate all IDs in subform tree with sequential IDs
const regenerateAllIdsSubform = (form: FormSubform): void => {
  const suffix = form.suffix || generateSuffix();
  let nextId = 2; // Start from 2, subform gets 1

  // Update subform ID
  form.id = `1${suffix}`;
  form.suffix = suffix;

  // Recursive function to regenerate IDs
  const regenerate = (node: FormNode): void => {
    if (node.nodeType !== 'subform') {
      node.id = `${nextId}${suffix}`;
      nextId++;
    }

    if ('children' in node && Array.isArray(node.children)) {
      node.children.forEach((child) => regenerate(child as FormNode));
    }
  };

  // Regenerate for all children
  form.children.forEach((child) => {
    regenerate(child);
  });

  // Update nextId in form
  form.nextId = nextId;
};

// Parse Subform XML
export const parseSubformXML = (xmlString: string): FormSubform | null => {
  try {
    const parser = new XMLParser(parserOptions);
    const result = parser.parse(xmlString);

    const subform = result['subform'];
    if (!subform) {
      console.error('No subform element found');
      return null;
    }

    const form: FormSubform = {
      id: String(subform['@_id'] || generateId()),
      nodeType: 'subform',
      title: String(subform['@_title'] || 'Untitled Subform'),
      suffix: String(subform['@_suffix'] || ''),
      nextId: parseInt(String(subform['@_nextid'] || '1'), 10) || 1,
      children: parseChildren(subform),
      _originalAttrs: extractOriginalAttrs(subform),
    };

    // Auto-regenerate all IDs to ensure uniqueness
    regenerateAllIdsSubform(form);

    return form;
  } catch (error) {
    console.error('Failed to parse Subform XML:', error);
    return null;
  }
};

// Build Subform XML
export const buildSubformXML = (form: FormSubform): string => {
  const builder = new XMLBuilder(builderOptions);

  // Helper to build with original attributes preserved
  const buildWithOriginalAttrs = (node: { _originalAttrs?: Record<string, string> }, overrides: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    // First copy original attributes (preserve unknown attributes)
    if (node._originalAttrs) {
      Object.entries(node._originalAttrs).forEach(([key, value]) => {
        // Handle 'true' and 'false' string values with placeholders
        if (value === 'true') {
          result[`@_${key}`] = '__BOOL_TRUE__';
        } else if (value === 'false') {
          result[`@_${key}`] = '__BOOL_FALSE__';
        } else {
          result[`@_${key}`] = value;
        }
      });
    }

    // Then apply overrides (our known fields)
    Object.entries(overrides).forEach(([key, value]) => {
      if (value !== undefined) {
        result[key] = value;
      }
    });

    return result;
  };

  const buildDescription = (desc: FormDescription) => buildWithOriginalAttrs(desc, {
    '@_id': desc.id,
    '@_prefix': desc.prefix,
    '#cdata': desc.text,
  });

  const buildWarning = (warning: FormWarning) => buildWithOriginalAttrs(warning, {
    '@_id': warning.id,
    '#cdata': warning.text,
  });

  const buildNote = (note: FormNote) => buildWithOriginalAttrs(note, {
    '@_id': note.id,
    '@_ischeckitem': String(note.isCheckItem),
    '#cdata': note.text,
  });

  const buildOption = (option: FormOption) => buildWithOriginalAttrs(option, {
    '@_id': option.id,
    '@_value': option.value,
    '#cdata': option.text,
  });

  const buildReference = (ref: FormReference) => buildWithOriginalAttrs(ref, {
    '@_id': ref.id,
    '@_table': ref.table,
    '@_field': ref.field,
  });

  const buildQuestion = (question: FormQuestion) => {
    const overrides: Record<string, unknown> = {
      '@_id': question.id,
      '@_type': question.type,
      '@_format': question.format,
      '@_required': question.required === true ? '__BOOL_TRUE__' : '__BOOL_FALSE__',
      '@_triggervalue': question.triggerValue || '',
      '@_comment': question.comment || '',
    };

    if (question.maxlength) overrides['@_maxlength'] = String(question.maxlength);
    if (question.option) overrides['@_option'] = question.option;
    if (question.refname) overrides['@_refname'] = question.refname;
    if (question.appType) overrides['@_app_type'] = question.appType;
    if (question.appTypeTrigger) overrides['@_app_type_trigger'] = question.appTypeTrigger;
    if (question.isAmended) overrides['@_isamended'] = '__BOOL_TRUE__';
    if (question.validatorClass) overrides['@_validatorclass'] = question.validatorClass;
    if (question.validationMessage) overrides['@_validationmessage'] = question.validationMessage;
    if (question.ncbeName) overrides['@_ncbe_name'] = question.ncbeName;
    if (question.ncbeCurrently) overrides['@_ncbe_currently'] = '__BOOL_TRUE__';
    if (question.ilgName) overrides['@_ilg_name'] = question.ilgName;

    const result = buildWithOriginalAttrs(question, overrides);

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
        const overrides: Record<string, unknown> = {
          '@_id': entity.id,
          '@_title': entity.title,
          '@_type': entity.type,
          '@_min': String(entity.min || ''),
          '@_max': String(entity.max || ''),
        };
        if (entity.groupType) overrides['@_grouptype'] = entity.groupType;
        if (entity.ncbeName) overrides['@_ncbe_name'] = entity.ncbeName;
        if (entity.ncbeValue) overrides['@_ncbe_value'] = entity.ncbeValue;
        if (entity.ilgName) overrides['@_ilg_name'] = entity.ilgName;
        if (entity.ilgValue) overrides['@_ilg_value'] = entity.ilgValue;

        const result = buildWithOriginalAttrs(entity, overrides);
        addChildrenToResult(result, entity.children);
        return result;
      }
      case 'conditionset': {
        const cs = node as FormConditionSet;
        const result = buildWithOriginalAttrs(cs, {
          '@_id': cs.id,
          '@_operator': cs.operator,
        });
        addChildrenToResult(result, cs.children);
        return result;
      }
      case 'conditionlogic': {
        const cl = node as FormConditionLogic;
        const result = buildWithOriginalAttrs(cl, {
          '@_id': cl.id,
          '@_operator': cl.operator,
        });
        // Add condition elements
        if (cl.conditions && cl.conditions.length > 0) {
          result['condition'] = cl.conditions.map((c) => buildWithOriginalAttrs(c, {
            '@_id': c.id,
            '@_equals': c.equals,
            '@_value': c.value,
            '@_questionid': c.questionId,
          }));
        }
        // Add other children
        addChildrenToResult(result, cl.children);
        return result;
      }
      case 'condition': {
        const cond = node as FormCondition;
        return buildWithOriginalAttrs(cond, {
          '@_id': cond.id,
          '@_equals': cond.equals,
          '@_value': cond.value,
          '@_questionid': cond.questionId,
        });
      }
      case 'conditional': {
        const cond = node as FormConditional;
        const result = buildWithOriginalAttrs(cond, {
          '@_id': cond.id,
        });
        addChildrenToResult(result, cond.children);
        return result;
      }
      case 'includeform': {
        const inc = node as FormIncludeForm;
        return buildWithOriginalAttrs(inc, {
          '@_id': inc.id,
          '@_formname': inc.formName,
          '@_title': inc.title,
          '@_type': inc.type,
          '@_multipleinclude': inc.multipleInclude ? '__BOOL_TRUE__' : '__BOOL_FALSE__',
          '@_required': inc.required ? '__BOOL_TRUE__' : '__BOOL_FALSE__',
        });
      }
      case 'required-doc': {
        const doc = node as FormRequiredDocument;
        return buildWithOriginalAttrs(doc, {
          '@_id': doc.id,
          '@_title': doc.title,
          '@_preventsubmit': doc.preventSubmit ? '__BOOL_TRUE__' : '__BOOL_FALSE__',
        });
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

  // Build subform with original attributes preserved
  const subformAttrs = buildWithOriginalAttrs(form, {
    '@_id': form.id,
    '@_nextid': String(form.nextId),
    '@_suffix': form.suffix,
    '@_order': '0',
    '@_title': form.title,
  });
  addChildrenToResult(subformAttrs, form.children);

  const xmlObj = {
    subform: subformAttrs,
  };

  const xmlContent = builder.build(xmlObj);
  // Replace placeholders with actual values (fast-xml-parser treats 'true'/'false' as boolean attributes)
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
    const result = parser.parse(xmlString);

    if (result['questionnaire']) return 'questionnaire';
    if (result['subform']) return 'subform';
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
