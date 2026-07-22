import {
  FormNode,
  FormRoot,
  FormCondition,
  FormConditionLogic,
  FormQuestion,
  FormSubSection,
} from '@/types/form';

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  nodeIds?: string[];
}

// Walk every node in the tree, including conditionlogic's separate conditions array
export const walkNodes = (node: FormNode, visit: (node: FormNode) => void): void => {
  visit(node);
  if (node.nodeType === 'conditionlogic') {
    const cl = node as FormConditionLogic;
    (cl.conditions || []).forEach(c => walkNodes(c, visit));
  }
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      walkNodes(child as FormNode, visit);
    }
  }
};

// Validate a form for structural problems the E-Bar engine would choke on
// or silently misbehave with
export const validateForm = (form: FormRoot | FormNode | null): ValidationError[] => {
  if (!form) return [];

  const errors: ValidationError[] = [];
  const allNodes: { id: string; nodeType: string }[] = [];
  const questionIds = new Set<string>();
  const dependableIds = new Set<string>(); // conditionset/conditionlogic ids
  const conditions: { cond: FormCondition; ownerId: string }[] = [];
  const dependents: { ss: FormSubSection }[] = [];
  const questionsWithoutDescription: string[] = [];

  walkNodes(form as FormNode, (node) => {
    allNodes.push({ id: node.id, nodeType: node.nodeType });

    if (node.nodeType === 'question') {
      const q = node as FormQuestion;
      questionIds.add(q.id);
      const hasDescription = (q.children || []).some(c => c.nodeType === 'description');
      if (!hasDescription) questionsWithoutDescription.push(q.id);
    }
    if (node.nodeType === 'conditionset' || node.nodeType === 'conditionlogic') {
      dependableIds.add(node.id);
    }
    if (node.nodeType === 'conditionlogic') {
      const cl = node as FormConditionLogic;
      (cl.conditions || []).forEach(cond => conditions.push({ cond, ownerId: node.id }));
    }
    if (node.nodeType === 'subsection') {
      const ss = node as FormSubSection;
      if (ss.depends) dependents.push({ ss });
    }
  });

  // Duplicate IDs (condition elements included)
  const idCounts = new Map<string, { count: number; nodeTypes: string[] }>();
  for (const { id, nodeType } of allNodes) {
    const existing = idCounts.get(id);
    if (existing) {
      existing.count++;
      existing.nodeTypes.push(nodeType);
    } else {
      idCounts.set(id, { count: 1, nodeTypes: [nodeType] });
    }
  }
  for (const [id, { count, nodeTypes }] of idCounts) {
    if (count > 1) {
      errors.push({
        type: 'error',
        message: `Duplicate ID "${id}" found ${count} times (${nodeTypes.join(', ')})`,
        nodeIds: [id],
      });
    }
  }

  // Empty IDs (E-Bar reads id on every node without a null check -> NPE)
  const emptyIds = allNodes.filter(({ id }) => !id || id.trim() === '');
  if (emptyIds.length > 0) {
    errors.push({
      type: 'error',
      message: `${emptyIds.length} node(s) have empty IDs`,
    });
  }

  // condition.questionid must reference an existing question
  for (const { cond, ownerId } of conditions) {
    if (cond.questionId && !questionIds.has(cond.questionId)) {
      errors.push({
        type: 'error',
        message: `Condition "${cond.id}" (in conditionlogic "${ownerId}") references missing question "${cond.questionId}"`,
        nodeIds: [ownerId],
      });
    }
  }

  // subsection depends must reference an existing conditionset/conditionlogic
  for (const { ss } of dependents) {
    if (ss.depends && !dependableIds.has(ss.depends)) {
      errors.push({
        type: 'error',
        message: `Subsection "${ss.id}" depends on missing conditionset/conditionlogic "${ss.depends}"`,
        nodeIds: [ss.id],
      });
    }
  }

  // A question with no description renders with no label in E-Bar
  for (const qid of questionsWithoutDescription) {
    errors.push({
      type: 'warning',
      message: `Question "${qid}" has no description child (renders without a label)`,
      nodeIds: [qid],
    });
  }

  // nextId must exceed every numeric prefix of suffix-matching ids
  if ('nextId' in form && 'suffix' in form) {
    const root = form as FormNode & { nextId: number; suffix: string };
    const suffix = root.suffix;
    for (const { id } of allNodes) {
      if (suffix && id.endsWith(suffix)) {
        const num = parseInt(id.slice(0, -suffix.length), 10);
        if (!isNaN(num) && num >= root.nextId) {
          errors.push({
            type: 'warning',
            message: `ID "${id}" >= nextId (${root.nextId}). nextId should be higher.`,
            nodeIds: [id],
          });
        }
      }
    }
  }

  return errors;
};
