import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  FormQuestionnaire,
  FormSection,
  FormSubSection,
  FormNode,
  FormQuestion,
  FormEntity,
  FormConditionSet,
  FormConditional,
  FormOption,
  FormDescription,
  FormWarning,
  FormNote,
  FormIncludeForm,
  FormRequiredDocument,
  FormReference,
  QuestionType,
  ProfileReferenceField,
} from '@/types/form';

interface FormState {
  // Current form
  form: FormQuestionnaire | null;

  // Selection state
  selectedNodeId: string | null;
  expandedNodes: Set<string>;

  // UI state
  isPreviewing: boolean;
  isSidebarCollapsed: boolean;

  // History for undo/redo
  history: FormQuestionnaire[];
  historyIndex: number;

  // Actions
  setForm: (form: FormQuestionnaire | null) => void;
  selectNode: (nodeId: string | null) => void;
  toggleNodeExpanded: (nodeId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  // Form mutations
  addSection: (title: string) => void;
  addSubSection: (sectionId: string, title: string) => void;
  addQuestion: (parentId: string, type: QuestionType) => void;
  addQuestionWithText: (parentId: string, type: QuestionType, text: string, format?: string) => void;
  addEntity: (parentId: string, title: string, entityType: 'single' | 'addmore') => void;
  addConditionSet: (parentId: string) => void;
  addConditional: (conditionSetId: string) => void;
  addOption: (questionId: string, value: string, text: string) => void;
  addDescription: (parentId: string, text: string) => void;
  addWarning: (parentId: string, text: string) => void;
  addNote: (parentId: string, text: string) => void;
  addIncludeForm: (parentId: string, formName: string, title: string) => void;
  addRequiredDoc: (parentId: string, title: string) => void;
  addAddressSet: (parentId: string) => void;
  addReference: (questionId: string, field: ProfileReferenceField) => void;

  updateNode: (nodeId: string, updates: Partial<FormNode>) => void;
  deleteNode: (nodeId: string) => void;
  moveNode: (nodeId: string, targetParentId: string, index: number) => void;
  duplicateNode: (nodeId: string) => void;
  copyNode: (nodeId: string) => void;
  pasteNode: (targetParentId: string) => void;
  canPaste: (targetParentId: string) => boolean;

  // UI actions
  togglePreview: () => void;
  toggleSidebar: () => void;

  // History actions
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;

  // Utility
  generateId: () => string;
  regenerateAllIds: () => void;
  findNodeById: (nodeId: string) => FormNode | null;
  findParentNode: (nodeId: string) => FormNode | null;
  getNodePath: (nodeId: string) => string[];
}

// Deep clone helper
const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

// Find node recursively
const findNodeRecursive = (node: FormNode, nodeId: string): FormNode | null => {
  if (node.id === nodeId) return node;

  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findNodeRecursive(child as FormNode, nodeId);
      if (found) return found;
    }
  }

  return null;
};

// Find parent node recursively
const findParentRecursive = (node: FormNode, nodeId: string, parent: FormNode | null = null): FormNode | null => {
  if (node.id === nodeId) return parent;

  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findParentRecursive(child as FormNode, nodeId, node);
      if (found) return found;
    }
  }

  return null;
};

// Collect all node IDs
const collectNodeIds = (node: FormNode): string[] => {
  const ids: string[] = [node.id];

  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      ids.push(...collectNodeIds(child as FormNode));
    }
  }

  return ids;
};

export const useFormStore = create<FormState>()(
  persist(
    (set, get) => {
      // ID generator that uses form's suffix and nextId
      // Format: nextId + suffix (e.g., nextId=2, suffix=00001 -> 200001)
      const generateId = (): string => {
        const form = get().form;
        if (form) {
          const id = `${form.nextId}${form.suffix}`;
          // Update nextId in form
          set((state) => ({
            form: state.form ? { ...state.form, nextId: state.form.nextId + 1 } : null,
          }));
          return id;
        }
        // Fallback for when no form exists
        return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      };

      // Create default question
      const createDefaultQuestion = (type: QuestionType): FormQuestion => {
        const questionId = generateId();
        const descId = generateId();

        // Base children with description
        const children: FormQuestion['children'] = [
          {
            id: descId,
            nodeType: 'description',
            prefix: '',
            text: 'New Question',
          },
        ];

        // Add Yes/No options for radio and select types
        if (type === 'radio' || type === 'radioseperate' || type === 'select') {
          children.push(
            { id: generateId(), nodeType: 'option', value: 'yes', text: 'Yes' },
            { id: generateId(), nodeType: 'option', value: 'no', text: 'No' }
          );
        }

        return {
          id: questionId,
          nodeType: 'question',
          type,
          format: '',
          required: true,
          triggerValue: '',
          comment: '',
          maxlength: 0,
          refname: '',
          appType: '',
          appTypeTrigger: '',
          isAmended: false,
          validatorClass: '',
          validationMessage: '',
          ncbeName: '',
          ncbeCurrently: false,
          ilgName: '',
          children,
        };
      };

      // Create default entity
      const createDefaultEntity = (title: string, type: 'single' | 'addmore'): FormEntity => ({
        id: generateId(),
        nodeType: 'entity',
        title,
        type,
        min: 0,
        max: type === 'addmore' ? 10 : 0,
        nextOrder: 1,
        showInBarAdmin: false,
        isAmended: false,
        groupType: '',
        ncbeName: '',
        ncbeValue: '',
        ilgName: '',
        ilgValue: '',
        children: [],
      });

      // Create default conditionset
      const createDefaultConditionSet = (): FormConditionSet => {
        const questionId = generateId();
        const descId = generateId();
        const option1Id = generateId();
        const option2Id = generateId();
        const conditionalId = generateId();
        const conditionSetId = generateId();

        return {
          id: conditionSetId,
          nodeType: 'conditionset',
          operator: 'and',
          children: [
            {
              id: questionId,
              nodeType: 'question',
              type: 'radio',
              format: '',
              required: false,
              triggerValue: 'yes',
              comment: '',
              maxlength: 0,
              refname: '',
              appType: '',
              appTypeTrigger: '',
              isAmended: false,
              validatorClass: '',
              validationMessage: '',
              ncbeName: '',
              ncbeCurrently: false,
              ilgName: '',
              children: [
                { id: descId, nodeType: 'description', prefix: '', text: 'Trigger Question' },
                { id: option1Id, nodeType: 'option', value: 'yes', text: 'Yes' },
                { id: option2Id, nodeType: 'option', value: 'no', text: 'No' },
              ],
            } as FormQuestion,
            {
              id: conditionalId,
              nodeType: 'conditional',
              condition: 'true',
              children: [],
            },
          ],
        };
      };

      return {
        // Initial state
        form: null,
        selectedNodeId: null,
        expandedNodes: new Set<string>(),
        isPreviewing: false,
        isSidebarCollapsed: false,
        history: [],
        historyIndex: -1,

        // Basic setters
        setForm: (form) => {
          set({ form, selectedNodeId: null });
          if (form) {
            get().saveToHistory();
          }
        },

        selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

        toggleNodeExpanded: (nodeId) => {
          const expanded = new Set(get().expandedNodes);
          if (expanded.has(nodeId)) {
            expanded.delete(nodeId);
          } else {
            expanded.add(nodeId);
          }
          set({ expandedNodes: expanded });
        },

        expandAll: () => {
          const form = get().form;
          if (!form) return;
          const allIds = collectNodeIds(form);
          set({ expandedNodes: new Set(allIds) });
        },

        collapseAll: () => {
          set({ expandedNodes: new Set() });
        },

        // Form mutations
        addSection: (title) => {
          const form = get().form;
          if (!form) return;

          const sectionId = generateId();
          const subsectionId = generateId();

          const newSubSection: FormSubSection = {
            id: subsectionId,
            nodeType: 'subsection',
            title: 'New Subsection',
            showInBarAdmin: false,
            children: [],
          };

          const newSection: FormSection = {
            id: sectionId,
            nodeType: 'section',
            title,
            showInBarAdmin: false,
            children: [newSubSection],
          };

          const updatedForm = deepClone(get().form!);
          updatedForm.children.push(newSection);

          // Auto-expand questionnaire and the new section to show subsection
          const expanded = new Set(get().expandedNodes);
          expanded.add(updatedForm.id);
          expanded.add(sectionId);

          set({ form: updatedForm, expandedNodes: expanded, selectedNodeId: subsectionId });
          get().saveToHistory();
        },

        addSubSection: (sectionId, title) => {
          const form = get().form;
          if (!form) return;

          // Generate ID first
          const newSubSection: FormSubSection = {
            id: generateId(),
            nodeType: 'subsection',
            title,
            showInBarAdmin: false,
            children: [],
          };

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const section = findNodeRecursive(updatedForm, sectionId) as FormSection | null;

          if (section && section.nodeType === 'section') {
            section.children.push(newSubSection);
            set({ form: updatedForm, selectedNodeId: newSubSection.id });
            get().saveToHistory();
          }
        },

        addQuestion: (parentId, type) => {
          const form = get().form;
          if (!form) return;

          // Create question first (this updates nextId in state)
          const newQuestion = createDefaultQuestion(type);

          // Now clone from updated state (with correct nextId)
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            const children = parent.children as FormNode[];
            // If there's a selected node in this parent, insert after it
            const selectedId = get().selectedNodeId;
            const selectedIndex = selectedId ? children.findIndex(c => c.id === selectedId) : -1;
            if (selectedIndex !== -1) {
              children.splice(selectedIndex + 1, 0, newQuestion);
            } else {
              children.push(newQuestion);
            }
            // Auto-expand parent to show the new question
            const expanded = new Set(get().expandedNodes);
            expanded.add(parentId);
            set({ form: updatedForm, selectedNodeId: newQuestion.id, expandedNodes: expanded });
            get().saveToHistory();
          }
        },

        addQuestionWithText: (parentId, type, text, format) => {
          const form = get().form;
          if (!form) return;

          // Create question first (this updates nextId in state)
          const newQuestion = createDefaultQuestion(type);
          // Update the description text
          const desc = newQuestion.children.find(c => c.nodeType === 'description');
          if (desc && 'text' in desc) {
            desc.text = text;
          }
          // Update format if provided
          if (format) {
            newQuestion.format = format;
          }

          // Now clone from updated state (with correct nextId)
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            (parent.children as FormNode[]).push(newQuestion);
            // Auto-expand parent
            const expanded = new Set(get().expandedNodes);
            expanded.add(parentId);
            set({ form: updatedForm, expandedNodes: expanded });
          }
        },

        addEntity: (parentId, title, entityType) => {
          const form = get().form;
          if (!form) return;

          // Create entity first (this updates nextId in state)
          const newEntity = createDefaultEntity(title, entityType);

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            const children = parent.children as FormNode[];
            // If there's a selected node in this parent, insert after it
            const selectedId = get().selectedNodeId;
            const selectedIndex = selectedId ? children.findIndex(c => c.id === selectedId) : -1;
            if (selectedIndex !== -1) {
              children.splice(selectedIndex + 1, 0, newEntity);
            } else {
              children.push(newEntity);
            }
            // Auto-expand parent
            const expanded = new Set(get().expandedNodes);
            expanded.add(parentId);
            set({ form: updatedForm, selectedNodeId: newEntity.id, expandedNodes: expanded });
            get().saveToHistory();
          }
        },

        addConditionSet: (parentId) => {
          const form = get().form;
          if (!form) return;

          // Create conditionset first (this updates nextId in state)
          const newConditionSet = createDefaultConditionSet();

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            const children = parent.children as FormNode[];
            // If there's a selected node in this parent, insert after it
            const selectedId = get().selectedNodeId;
            const selectedIndex = selectedId ? children.findIndex(c => c.id === selectedId) : -1;
            if (selectedIndex !== -1) {
              children.splice(selectedIndex + 1, 0, newConditionSet);
            } else {
              children.push(newConditionSet);
            }
            // Auto-expand parent
            const expanded = new Set(get().expandedNodes);
            expanded.add(parentId);
            set({ form: updatedForm, selectedNodeId: newConditionSet.id, expandedNodes: expanded });
            get().saveToHistory();
          }
        },

        addConditional: (conditionSetId) => {
          const form = get().form;
          if (!form) return;

          // Generate ID first (this updates nextId in state)
          const newConditional: FormConditional = {
            id: generateId(),
            nodeType: 'conditional',
            condition: 'true',
            children: [],
          };

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, conditionSetId) as FormConditionSet | null;

          if (parent && parent.nodeType === 'conditionset') {
            parent.children.push(newConditional);
            // Auto-expand parent
            const expanded = new Set(get().expandedNodes);
            expanded.add(conditionSetId);
            set({ form: updatedForm, selectedNodeId: newConditional.id, expandedNodes: expanded });
            get().saveToHistory();
          }
        },

        addOption: (questionId, value, text) => {
          const form = get().form;
          if (!form) return;

          // Generate ID first
          const newOption: FormOption = {
            id: generateId(),
            nodeType: 'option',
            value,
            text,
          };

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const question = findNodeRecursive(updatedForm, questionId) as FormQuestion | null;

          if (question && question.nodeType === 'question') {
            question.children.push(newOption);
            set({ form: updatedForm });
            get().saveToHistory();
          }
        },

        addDescription: (parentId, text) => {
          const form = get().form;
          if (!form) return;

          // Generate ID first
          const newDescription: FormDescription = {
            id: generateId(),
            nodeType: 'description',
            prefix: '',
            text,
          };

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            (parent.children as FormNode[]).push(newDescription);
            set({ form: updatedForm });
            get().saveToHistory();
          }
        },

        addWarning: (parentId, text) => {
          const form = get().form;
          if (!form) return;

          // Generate ID first
          const newWarning: FormWarning = {
            id: generateId(),
            nodeType: 'warning',
            text,
          };

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            (parent.children as FormNode[]).push(newWarning);
            set({ form: updatedForm });
            get().saveToHistory();
          }
        },

        addNote: (parentId, text) => {
          const form = get().form;
          if (!form) return;

          // Generate ID first
          const newNote: FormNote = {
            id: generateId(),
            nodeType: 'note',
            text,
            isCheckItem: false,
          };

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            (parent.children as FormNode[]).push(newNote);
            set({ form: updatedForm });
            get().saveToHistory();
          }
        },

        addIncludeForm: (parentId, formName, title) => {
          const form = get().form;
          if (!form) return;

          // Generate ID first
          const newIncludeForm: FormIncludeForm = {
            id: generateId(),
            nodeType: 'includeform',
            formName,
            title,
            type: 'online',
            multipleInclude: false,
            required: true,
          };

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            (parent.children as FormNode[]).push(newIncludeForm);
            const expanded = new Set(get().expandedNodes);
            expanded.add(parentId);
            set({ form: updatedForm, selectedNodeId: newIncludeForm.id, expandedNodes: expanded });
            get().saveToHistory();
          }
        },

        addRequiredDoc: (parentId, title) => {
          const form = get().form;
          if (!form) return;

          // Generate ID first
          const newRequiredDoc: FormRequiredDocument = {
            id: generateId(),
            nodeType: 'required-doc',
            title,
            preventSubmit: true,
          };

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            (parent.children as FormNode[]).push(newRequiredDoc);
            const expanded = new Set(get().expandedNodes);
            expanded.add(parentId);
            set({ form: updatedForm, selectedNodeId: newRequiredDoc.id, expandedNodes: expanded });
            get().saveToHistory();
          }
        },

        addAddressSet: (parentId) => {
          const form = get().form;
          if (!form) return;

          // Helper to create address question
          const createAddressQuestion = (label: string, type: QuestionType, required: boolean): FormQuestion => {
            const questionId = generateId();
            const descId = generateId();
            return {
              id: questionId,
              nodeType: 'question',
              type,
              format: '',
              required,
              triggerValue: '',
              comment: '',
              maxlength: 0,
              refname: '',
              appType: '',
              appTypeTrigger: '',
              isAmended: false,
              validatorClass: '',
              validationMessage: '',
              ncbeName: '',
              ncbeCurrently: false,
              ilgName: '',
              children: [
                { id: descId, nodeType: 'description', prefix: '', text: label },
              ],
            };
          };

          // Create all address fields
          const addressFields: FormQuestion[] = [
            createAddressQuestion('Address 1', 'char', true),
            createAddressQuestion('Address 2', 'char', false),
            createAddressQuestion('City', 'char', true),
            createAddressQuestion('State', 'state', true),
            createAddressQuestion('County', 'county', true),
            createAddressQuestion('Country', 'country', true),
            createAddressQuestion('Zip', 'zip', true),
          ];

          // Now clone from updated state
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, parentId);

          if (parent && 'children' in parent) {
            (parent.children as FormNode[]).push(...addressFields);
            const expanded = new Set(get().expandedNodes);
            expanded.add(parentId);
            set({ form: updatedForm, selectedNodeId: addressFields[0].id, expandedNodes: expanded });
            get().saveToHistory();
          }
        },

        addReference: (questionId, field) => {
          const form = get().form;
          if (!form) return;

          // Generate ID first
          const newReference: FormReference = {
            id: generateId(),
            nodeType: 'reference',
            table: 'profile',
            field,
          };

          // Clone form
          const updatedForm = deepClone(get().form!);
          const question = findNodeRecursive(updatedForm, questionId) as FormQuestion | null;

          if (question && question.nodeType === 'question') {
            // Change question type to profilereference
            question.type = 'profilereference';
            // Remove existing references and add new one
            question.children = question.children.filter(c => c.nodeType !== 'reference');
            question.children.push(newReference);

            const expanded = new Set(get().expandedNodes);
            expanded.add(questionId);
            set({ form: updatedForm, selectedNodeId: questionId, expandedNodes: expanded });
            get().saveToHistory();
          }
        },

        updateNode: (nodeId, updates) => {
          const form = get().form;
          if (!form) return;

          const updatedForm = deepClone(form);
          const node = findNodeRecursive(updatedForm, nodeId);

          if (node) {
            Object.assign(node, updates);
            set({ form: updatedForm });
            get().saveToHistory();
          }
        },

        deleteNode: (nodeId) => {
          const form = get().form;
          if (!form) return;

          const updatedForm = deepClone(form);
          const parent = findParentRecursive(updatedForm, nodeId);

          if (parent && 'children' in parent) {
            const children = parent.children as FormNode[];
            const index = children.findIndex((c) => c.id === nodeId);
            if (index !== -1) {
              children.splice(index, 1);
              set({ form: updatedForm, selectedNodeId: null });
              get().saveToHistory();
            }
          }
        },

        moveNode: (nodeId, targetParentId, index) => {
          const form = get().form;
          if (!form) return;

          const updatedForm = deepClone(form);

          // Helper to recursively find and remove node from tree
          const removeNodeFromTree = (parent: FormNode, targetId: string): FormNode | null => {
            if (!('children' in parent) || !Array.isArray(parent.children)) return null;

            const children = parent.children as FormNode[];
            const idx = children.findIndex((c) => c.id === targetId);

            if (idx !== -1) {
              const [removed] = children.splice(idx, 1);
              return removed;
            }

            for (const child of children) {
              const result = removeNodeFromTree(child, targetId);
              if (result) return result;
            }

            return null;
          };

          // Remove from current location
          const removedNode = removeNodeFromTree(updatedForm, nodeId);
          if (!removedNode) return; // Node not found or already moved

          // Find target parent and insert
          const newParent = findNodeRecursive(updatedForm, targetParentId);
          if (!newParent || !('children' in newParent)) return;

          const newChildren = newParent.children as FormNode[];
          // Ensure index is within bounds
          const safeIndex = Math.min(index, newChildren.length);
          newChildren.splice(safeIndex, 0, removedNode);

          set({ form: updatedForm });
          get().saveToHistory();
        },

        duplicateNode: (nodeId) => {
          const form = get().form;
          if (!form) return;

          const updatedForm = deepClone(form);
          const node = findNodeRecursive(updatedForm, nodeId);
          const parent = findParentRecursive(updatedForm, nodeId);

          if (node && parent && 'children' in parent) {
            const cloned = deepClone(node);
            // Regenerate all IDs
            const regenerateIds = (n: FormNode): void => {
              n.id = generateId();
              if ('children' in n && Array.isArray(n.children)) {
                n.children.forEach((c) => regenerateIds(c as FormNode));
              }
            };
            regenerateIds(cloned);

            const children = parent.children as FormNode[];
            const index = children.findIndex((c) => c.id === nodeId);
            children.splice(index + 1, 0, cloned);

            set({ form: updatedForm, selectedNodeId: cloned.id });
            get().saveToHistory();
          }
        },

        copyNode: (nodeId) => {
          const form = get().form;
          if (!form) return;

          const node = findNodeRecursive(form, nodeId);
          if (!node) return;

          // Deep clone the node and store in localStorage for cross-tab access
          const cloned = deepClone(node);
          const clipboardData = {
            node: cloned,
            timestamp: Date.now(),
          };

          try {
            localStorage.setItem('formforge-clipboard', JSON.stringify(clipboardData));
          } catch (e) {
            console.error('Failed to copy to clipboard:', e);
          }
        },

        pasteNode: (targetParentId) => {
          const form = get().form;
          if (!form) return;

          // Read from localStorage
          let clipboardData: { node: FormNode; timestamp: number } | null = null;
          try {
            const stored = localStorage.getItem('formforge-clipboard');
            if (stored) {
              clipboardData = JSON.parse(stored);
            }
          } catch (e) {
            console.error('Failed to read clipboard:', e);
            return;
          }

          if (!clipboardData || !clipboardData.node) return;

          // Clone the node
          const cloned = deepClone(clipboardData.node);

          // Regenerate all IDs using current form's suffix
          const regenerateIds = (n: FormNode): void => {
            n.id = generateId();
            if ('children' in n && Array.isArray(n.children)) {
              n.children.forEach((c) => regenerateIds(c as FormNode));
            }
          };
          regenerateIds(cloned);

          // Find target parent and add the node
          const updatedForm = deepClone(get().form!);
          const parent = findNodeRecursive(updatedForm, targetParentId);

          if (parent && 'children' in parent) {
            const children = parent.children as FormNode[];
            // If there's a selected node in this parent, insert after it
            const selectedId = get().selectedNodeId;
            const selectedIndex = selectedId ? children.findIndex(c => c.id === selectedId) : -1;
            if (selectedIndex !== -1) {
              children.splice(selectedIndex + 1, 0, cloned);
            } else {
              children.push(cloned);
            }
            const expanded = new Set(get().expandedNodes);
            expanded.add(targetParentId);
            set({ form: updatedForm, selectedNodeId: cloned.id, expandedNodes: expanded });
            get().saveToHistory();
          }
        },

        canPaste: (targetParentId) => {
          // Check if there's something in clipboard
          try {
            const stored = localStorage.getItem('formforge-clipboard');
            if (!stored) return false;

            const clipboardData = JSON.parse(stored);
            if (!clipboardData || !clipboardData.node) return false;

            // Check if target can accept this node type
            const form = get().form;
            if (!form) return false;

            const parent = findNodeRecursive(form, targetParentId);
            if (!parent) return false;

            const nodeType = clipboardData.node.nodeType;
            const parentType = parent.nodeType;

            // Rules for what can be pasted where
            const rules: Record<string, string[]> = {
              questionnaire: ['section'],
              section: ['subsection'],
              subsection: ['question', 'entity', 'conditionset', 'description', 'warning', 'note', 'includeform', 'required-doc'],
              entity: ['question', 'entity', 'conditionset', 'description', 'warning', 'note', 'includeform', 'required-doc'],
              conditionset: ['question', 'conditional', 'description', 'warning', 'note', 'required-doc'],
              conditional: ['question', 'entity', 'conditionset', 'description', 'warning', 'note', 'includeform', 'required-doc'],
            };

            return rules[parentType]?.includes(nodeType) || false;
          } catch {
            return false;
          }
        },

        // UI actions
        togglePreview: () => set((state) => ({ isPreviewing: !state.isPreviewing })),
        toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

        // History
        saveToHistory: () => {
          const form = get().form;
          if (!form) return;

          const history = get().history.slice(0, get().historyIndex + 1);
          history.push(deepClone(form));

          // Keep only last 50 states
          if (history.length > 50) {
            history.shift();
          }

          set({ history, historyIndex: history.length - 1 });
        },

        undo: () => {
          const { history, historyIndex } = get();
          if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            set({ form: deepClone(history[newIndex]), historyIndex: newIndex });
          }
        },

        redo: () => {
          const { history, historyIndex } = get();
          if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            set({ form: deepClone(history[newIndex]), historyIndex: newIndex });
          }
        },

        // Utilities
        generateId: () => generateId(),

        regenerateAllIds: () => {
          const form = get().form;
          if (!form) return;

          const updatedForm = deepClone(form);
          const suffix = updatedForm.suffix;
          let counter = 1;

          // Recursive function to regenerate IDs for all nodes
          const regenerateIds = (node: FormNode): void => {
            // Assign new ID using counter + suffix format
            node.id = `${counter}${suffix}`;
            counter++;

            // Process children if they exist
            if ('children' in node && Array.isArray(node.children)) {
              node.children.forEach((child) => regenerateIds(child as FormNode));
            }
          };

          regenerateIds(updatedForm);

          // Update nextId to continue from where we left off
          updatedForm.nextId = counter;

          set({ form: updatedForm, selectedNodeId: null });
          get().saveToHistory();
        },

        findNodeById: (nodeId) => {
          const form = get().form;
          if (!form) return null;
          return findNodeRecursive(form, nodeId);
        },

        findParentNode: (nodeId) => {
          const form = get().form;
          if (!form) return null;
          return findParentRecursive(form, nodeId);
        },

        getNodePath: (nodeId) => {
          const form = get().form;
          if (!form) return [];

          const path: string[] = [];
          const findPath = (node: FormNode, targetId: string): boolean => {
            if (node.id === targetId) {
              path.push(node.id);
              return true;
            }

            if ('children' in node && Array.isArray(node.children)) {
              for (const child of node.children) {
                if (findPath(child as FormNode, targetId)) {
                  path.unshift(node.id);
                  return true;
                }
              }
            }

            return false;
          };

          findPath(form, nodeId);
          return path;
        },
      };
    },
    {
      name: 'formforge-storage',
      partialize: (state) => ({
        form: state.form,
        expandedNodes: Array.from(state.expandedNodes),
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<FormState>),
        expandedNodes: new Set((persisted as { expandedNodes?: string[] })?.expandedNodes || []),
      }),
    }
  )
);
