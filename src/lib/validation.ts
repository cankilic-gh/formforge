import {
  FormNode,
  FormRoot,
  FormCondition,
  FormConditionLogic,
  FormQuestion,
  FormSubSection,
  FormReference,
  FormValidator,
  FormEntity,
  FormDescription,
  FormOption,
} from '@/types/form';
import {
  ELEMENT_BY_NODETYPE,
  QUESTION_TYPE_SET,
  DATE_FAMILY_TYPES,
  DATE_FORMAT_SET,
  OPTION_BEARING_TYPES,
  VALUE_DISPLAY_TYPES,
  CONDITIONSET_OPERATOR_SET,
  CONDITIONLOGIC_OPERATOR_SET,
  ENTITY_TYPE_SET,
  PROFILE_FIELD_SET,
  isKnownValidatorClass,
} from '@/lib/engineModel';

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  nodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Tree walking
// ---------------------------------------------------------------------------

// Public walker (kept stable: the CLI and Test Lab import this).
// Visits every node, including the conditionlogic's separate `conditions` array.
export const walkNodes = (node: FormNode, visit: (node: FormNode) => void): void => {
  visit(node);
  if (node.nodeType === 'conditionlogic') {
    const cl = node as FormConditionLogic;
    (cl.conditions || []).forEach((c) => walkNodes(c, visit));
  }
  if ('children' in node && Array.isArray((node as { children?: unknown }).children)) {
    for (const child of (node as { children: FormNode[] }).children) {
      walkNodes(child, visit);
    }
  }
};

// Internal walker that also passes the ancestor chain (nearest parent last).
const walkWithAncestors = (
  node: FormNode,
  ancestors: FormNode[],
  visit: (node: FormNode, ancestors: FormNode[]) => void
): void => {
  visit(node, ancestors);
  const next = [...ancestors, node];
  if (node.nodeType === 'conditionlogic') {
    const cl = node as FormConditionLogic;
    (cl.conditions || []).forEach((c) => walkWithAncestors(c, next, visit));
  }
  if ('children' in node && Array.isArray((node as { children?: unknown }).children)) {
    for (const child of (node as { children: FormNode[] }).children) {
      walkWithAncestors(child, next, visit);
    }
  }
};

// ---------------------------------------------------------------------------
// Attribute presence helpers
// ---------------------------------------------------------------------------

// Presence can only be judged from the raw attributes the parser preserved.
// - true      : the attribute was written in the source XML (even if empty)
// - false     : the attribute was absent in the source XML
// - 'unknown' : this node has no preserved attrs (e.g. freshly created in the
//               editor); we cannot tell, so crash-attr checks are skipped to
//               avoid false positives.
const attrPresent = (node: FormNode, name: string): boolean | 'unknown' => {
  const orig = node._originalAttrs;
  if (!orig) return 'unknown';
  return Object.prototype.hasOwnProperty.call(orig, name);
};

const rawAttr = (node: FormNode, name: string): string | undefined => node._originalAttrs?.[name];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// Validate a form against the E-Bar engine contract (see engineModel.ts).
// Errors are conditions the real engine would crash on (whole form fails to
// load) or render invisibly. Warnings are silent-degrade / suspicious cases.
export const validateForm = (form: FormRoot | FormNode | null): ValidationError[] => {
  if (!form) return [];

  const errors: ValidationError[] = [];
  const allNodes: { node: FormNode; ancestors: FormNode[] }[] = [];
  const questionIds = new Set<string>();
  const dependableIds = new Set<string>(); // conditionset/conditionlogic ids
  const conditions: { cond: FormCondition; ownerId: string }[] = [];
  const dependents: { ss: FormSubSection }[] = [];

  walkWithAncestors(form as FormNode, [], (node, ancestors) => {
    allNodes.push({ node, ancestors });
    if (node.nodeType === 'question') questionIds.add(node.id);
    if (node.nodeType === 'conditionset' || node.nodeType === 'conditionlogic') dependableIds.add(node.id);
    if (node.nodeType === 'conditionlogic') {
      const cl = node as FormConditionLogic;
      (cl.conditions || []).forEach((cond) => conditions.push({ cond, ownerId: node.id }));
    }
    if (node.nodeType === 'subsection') {
      const ss = node as FormSubSection;
      if (ss.depends) dependents.push({ ss });
    }
  });

  // --- IDs: missing / empty / non-numeric / duplicate -----------------------
  const idCounts = new Map<string, { count: number; nodeTypes: string[] }>();
  for (const { node } of allNodes) {
    // Missing id attribute in the source XML => NPE at parse.
    if (attrPresent(node, 'id') === false) {
      errors.push({
        type: 'error',
        message: `<${node.nodeType}> is missing the required "id" attribute (E-Bar reads id on every element without a null-check => NullPointerException, whole form fails to load).`,
      });
    }
    const id = node.id ?? '';
    if (id.trim() === '') {
      errors.push({ type: 'error', message: `<${node.nodeType}> has an empty id (E-Bar NPEs on a blank id).` });
    } else if (!/^\d+$/.test(id)) {
      errors.push({
        type: 'error',
        message: `<${node.nodeType}> id "${id}" is not a whole number. E-Bar parses id with parseInt and crashes on a non-numeric id.`,
        nodeIds: [id],
      });
    }
    const existing = idCounts.get(id);
    if (existing) {
      existing.count++;
      existing.nodeTypes.push(node.nodeType);
    } else {
      idCounts.set(id, { count: 1, nodeTypes: [node.nodeType] });
    }
  }
  for (const [id, { count, nodeTypes }] of idCounts) {
    if (id.trim() !== '' && count > 1) {
      errors.push({
        type: 'error',
        message: `Duplicate id "${id}" used ${count} times (${nodeTypes.join(', ')}). Ids must be unique across the whole form.`,
        nodeIds: [id],
      });
    }
  }

  // --- Per-element required attributes & enums (data-driven) ----------------
  for (const { node } of allNodes) {
    const rule = ELEMENT_BY_NODETYPE[node.nodeType];
    if (!rule) continue; // unknown / runtime-only node types
    for (const attr of rule.attrs) {
      if (attr.name === 'id') continue; // handled above

      const present = attrPresent(node, attr.name);
      if (present === false && (attr.whenMissing === 'crash' || attr.whenMissing === 'invisible')) {
        errors.push({
          type: 'error',
          message: `<${node.nodeType} id="${node.id}"> is missing required attribute "${attr.name}". ${attr.effect}`,
          nodeIds: [node.id],
        });
        continue; // no point enum-checking an absent value
      }

      // Enum check on a present value (generic; type/format handled separately below).
      if (present === true && attr.values && attr.values.length > 0) {
        const value = rawAttr(node, attr.name) ?? '';
        if (!attr.values.includes(value)) {
          const sev = attr.whenUnknown === 'crash' || attr.whenUnknown === 'invisible' ? 'error' : 'warning';
          errors.push({
            type: sev,
            message: `<${node.nodeType} id="${node.id}"> has ${attr.name}="${value}", which is not a recognized value. ${attr.unknownEffect ?? ''}`.trim(),
            nodeIds: [node.id],
          });
        }
      }
    }
  }

  // --- Question type (unknown / case-sensitive "text") ----------------------
  for (const { node } of allNodes) {
    if (node.nodeType !== 'question') continue;
    if (attrPresent(node, 'type') !== true) continue; // missing handled by element rule
    const raw = rawAttr(node, 'type') ?? '';
    if (QUESTION_TYPE_SET.has(raw)) continue; // valid (includes the legacy "")
    const lower = raw.toLowerCase();
    if (lower === 'text') {
      errors.push({
        type: 'error',
        message: `<question id="${node.id}"> type="${raw}". The "text" type is matched case-sensitively; only lowercase "text" works, otherwise the question renders invisibly.`,
        nodeIds: [node.id],
      });
    } else if (QUESTION_TYPE_SET.has(lower)) {
      // case-insensitive match (e.g. "Radio") - engine accepts it, but flag the convention
      errors.push({
        type: 'warning',
        message: `<question id="${node.id}"> type="${raw}" works (types are case-insensitive except "text"), but convention is lowercase "${lower}".`,
        nodeIds: [node.id],
      });
    } else {
      errors.push({
        type: 'error',
        message: `<question id="${node.id}"> has unknown type="${raw}". No renderer matches, so the question renders as empty output with no error.`,
        nodeIds: [node.id],
      });
    }
  }

  // --- Date format vocabulary (unknown => silent mm/dd/yy) ------------------
  for (const { node } of allNodes) {
    if (node.nodeType !== 'question') continue;
    const q = node as FormQuestion;
    const rawType = rawAttr(node, 'type') ?? q.type;
    if (!DATE_FAMILY_TYPES.has(rawType)) continue;
    if (attrPresent(node, 'format') !== true) continue;
    const fmt = rawAttr(node, 'format') ?? '';
    if (fmt !== '' && !DATE_FORMAT_SET.has(fmt)) {
      errors.push({
        type: 'warning',
        message: `<question id="${node.id}"> date format="${fmt}" is not a recognized format; the engine silently falls back to full mm/dd/yy.`,
        nodeIds: [node.id],
      });
    }
  }

  // --- Options presence / radioseperate segments ----------------------------
  for (const { node } of allNodes) {
    if (node.nodeType !== 'question') continue;
    const q = node as FormQuestion;
    const rawType = rawAttr(node, 'type') ?? q.type;
    const optionChildren = (q.children || []).filter((c) => c.nodeType === 'option') as FormOption[];
    const hasReference = (q.children || []).some((c) => c.nodeType === 'reference');

    if (OPTION_BEARING_TYPES.has(rawType)) {
      if (optionChildren.length === 0 && !(rawType === 'select' && hasReference)) {
        errors.push({
          type: 'warning',
          message: `<question id="${node.id}" type="${rawType}"> has no <option> children${rawType === 'select' ? ' and no <reference>' : ''}, so it renders an empty control.`,
          nodeIds: [node.id],
        });
      }
    } else if (optionChildren.length > 0) {
      errors.push({
        type: 'warning',
        message: `<question id="${node.id}" type="${rawType}"> carries <option> children, but type "${rawType}" ignores options (they will not render).`,
        nodeIds: [node.id],
      });
    }

    if (rawType === 'radioseperate') {
      const desc = (q.children || []).find((c) => c.nodeType === 'description') as FormDescription | undefined;
      const segments = desc ? (desc.text.split('<---->').length) : 0;
      if (desc) {
        if (segments < 2 || segments > 5) {
          errors.push({
            type: 'warning',
            message: `<question id="${node.id}"> is radioseperate but its description splits into ${segments} segment(s) on "<---->" (must be 2-5). Insert one "<---->" between each pair of options.`,
            nodeIds: [node.id],
          });
        } else if (segments !== optionChildren.length) {
          errors.push({
            type: 'warning',
            message: `<question id="${node.id}"> radioseperate has ${optionChildren.length} option(s) but ${segments} text segment(s); the counts must match so each radio lands in a slot.`,
            nodeIds: [node.id],
          });
        }
      }
    }
  }

  // --- reference field known? ----------------------------------------------
  for (const { node } of allNodes) {
    if (node.nodeType !== 'reference') continue;
    const ref = node as FormReference;
    if (attrPresent(node, 'field') !== true) continue; // missing handled by element rule
    const field = String(ref.field || rawAttr(node, 'field') || '');
    if (field !== '' && !PROFILE_FIELD_SET.has(field)) {
      errors.push({
        type: 'warning',
        message: `<reference> field="${field}" is not in the known profile-field list; Reference.getReference returns empty for unrecognized fields. Verify the field name.`,
        nodeIds: [node.id],
      });
    }
  }

  // --- validatorclass known? -----------------------------------------------
  for (const { node } of allNodes) {
    let fqn = '';
    let ownerId = node.id;
    if (node.nodeType === 'validator') fqn = (node as FormValidator).validatorClass || '';
    else if (node.nodeType === 'question') fqn = (node as FormQuestion).validatorClass || '';
    if (!fqn) continue;
    if (!isKnownValidatorClass(fqn)) {
      errors.push({
        type: 'warning',
        message: `validatorclass "${fqn}" is not a known E-Bar validator. If it is a new validator make sure the Java class exists, otherwise it throws ClassNotFoundException at runtime.`,
        nodeIds: [ownerId],
      });
    }
  }

  // --- conditionlogic must live inside a subsection or entity ---------------
  for (const { node, ancestors } of allNodes) {
    if (node.nodeType !== 'conditionlogic') continue;
    const hasHost = ancestors.some((a) => a.nodeType === 'subsection' || a.nodeType === 'entity');
    if (!hasHost) {
      errors.push({
        type: 'error',
        message: `<conditionlogic id="${node.id}"> is not inside a subsection or entity. The evaluator dereferences the parent subsection and NPEs when there is none.`,
        nodeIds: [node.id],
      });
    }
  }

  // --- condition.questionid must reference an existing question -------------
  for (const { cond, ownerId } of conditions) {
    if (cond.questionId && !questionIds.has(cond.questionId)) {
      errors.push({
        type: 'error',
        message: `<condition id="${cond.id}"> (in conditionlogic "${ownerId}") references question "${cond.questionId}", which does not exist in this form.`,
        nodeIds: [ownerId],
      });
    }
  }

  // --- subsection.depends must reference an existing set/logic --------------
  for (const { ss } of dependents) {
    if (ss.depends && !dependableIds.has(ss.depends)) {
      errors.push({
        type: 'error',
        message: `<subsection id="${ss.id}"> depends="${ss.depends}", but no conditionset/conditionlogic with that id exists.`,
        nodeIds: [ss.id],
      });
    }
  }

  // --- entity: nextorder should exceed order (add-more bookkeeping) ---------
  for (const { node } of allNodes) {
    if (node.nodeType !== 'entity') continue;
    const e = node as FormEntity;
    if (e.type === 'addmore' && typeof e.nextOrder === 'number' && typeof e.entityOrder === 'number') {
      if (e.nextOrder <= e.entityOrder) {
        errors.push({
          type: 'warning',
          message: `<entity id="${node.id}"> is add-more with nextorder=${e.nextOrder} <= order=${e.entityOrder}; the next added row would collide with the template.`,
          nodeIds: [node.id],
        });
      }
    }
  }

  // --- Questions with no description render without a label -----------------
  // Skipped for value-display types (profilereference/examreference): they emit
  // a profile value and take their label from an adjacent simpletext, so having
  // no description child is normal and correct.
  for (const { node } of allNodes) {
    if (node.nodeType !== 'question') continue;
    const q = node as FormQuestion;
    const rawType = rawAttr(node, 'type') ?? q.type;
    if (VALUE_DISPLAY_TYPES.has(rawType)) continue;
    const hasDescription = (q.children || []).some((c) => c.nodeType === 'description');
    if (!hasDescription) {
      errors.push({
        type: 'warning',
        message: `Question "${q.id}" has no description child (renders without a label).`,
        nodeIds: [q.id],
      });
    }
  }

  // --- nextId must exceed every numeric prefix of suffix-matching ids -------
  if ('nextId' in form && 'suffix' in form) {
    const root = form as FormNode & { nextId: number; suffix: string };
    const suffix = root.suffix;
    for (const { node } of allNodes) {
      const id = node.id;
      if (suffix && id.endsWith(suffix)) {
        const num = parseInt(id.slice(0, -suffix.length), 10);
        if (!isNaN(num) && num >= root.nextId) {
          errors.push({
            type: 'warning',
            message: `id "${id}" has a prefix >= nextId (${root.nextId}). Raise nextId above every used prefix or the next new node will collide.`,
            nodeIds: [id],
          });
        }
      }
    }
  }

  return errors;
};
