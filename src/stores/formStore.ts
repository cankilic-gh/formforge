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
  QuestionType,
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
  addEntity: (parentId: string, title: string, entityType: 'single' | 'addmore') => void;
  addConditionSet: (parentId: string) => void;

  updateNode: (nodeId: string, updates: Partial<FormNode>) => void;
  deleteNode: (nodeId: string) => void;
  moveNode: (nodeId: string, targetParentId: string, index: number) => void;
  duplicateNode: (nodeId: string) => void;

  // UI actions
  togglePreview: () => void;
  toggleSidebar: () => void;

  // History actions
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;

  // Utility
  generateId: () => string;
  findNodeById: (nodeId: string) => FormNode | null;
  findParentNode: (nodeId: string) => FormNode | null;
  getNodePath: (nodeId: string) => string[];
}

// Helper to generate unique IDs
let idCounter = Date.now();
const generateId = (): string => {
  idCounter++;
  return `node_${idCounter}`;
};

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

// Create default question
const createDefaultQuestion = (type: QuestionType): FormQuestion => ({
  id: generateId(),
  nodeType: 'question',
  type,
  format: '',
  required: false,
  triggerValue: '',
  comment: '',
  maxlength: type === 'char' ? 500 : type === 'text' ? 5000 : 0,
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
    {
      id: generateId(),
      nodeType: 'description',
      prefix: '',
      text: 'New Question',
    },
  ],
});

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
const createDefaultConditionSet = (): FormConditionSet => ({
  id: generateId(),
  nodeType: 'conditionset',
  operator: 'and',
  children: [
    {
      ...createDefaultQuestion('radio'),
      triggerValue: 'yes',
      children: [
        { id: generateId(), nodeType: 'description', prefix: '', text: 'Trigger Question' },
        { id: generateId(), nodeType: 'option', value: 'yes', text: 'Yes' },
        { id: generateId(), nodeType: 'option', value: 'no', text: 'No' },
      ],
    },
    {
      id: generateId(),
      nodeType: 'conditional',
      condition: 'true',
      children: [],
    },
  ],
});

export const useFormStore = create<FormState>()(
  persist(
    (set, get) => ({
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

        const newSection: FormSection = {
          id: generateId(),
          nodeType: 'section',
          title,
          showInBarAdmin: false,
          children: [],
        };

        const updatedForm = deepClone(form);
        updatedForm.children.push(newSection);
        set({ form: updatedForm });
        get().saveToHistory();
      },

      addSubSection: (sectionId, title) => {
        const form = get().form;
        if (!form) return;

        const updatedForm = deepClone(form);
        const section = findNodeRecursive(updatedForm, sectionId) as FormSection | null;

        if (section && section.nodeType === 'section') {
          const newSubSection: FormSubSection = {
            id: generateId(),
            nodeType: 'subsection',
            title,
            showInBarAdmin: false,
            children: [],
          };
          section.children.push(newSubSection);
          set({ form: updatedForm });
          get().saveToHistory();
        }
      },

      addQuestion: (parentId, type) => {
        const form = get().form;
        if (!form) return;

        const updatedForm = deepClone(form);
        const parent = findNodeRecursive(updatedForm, parentId);

        if (parent && 'children' in parent) {
          const newQuestion = createDefaultQuestion(type);
          (parent.children as FormNode[]).push(newQuestion);
          set({ form: updatedForm, selectedNodeId: newQuestion.id });
          get().saveToHistory();
        }
      },

      addEntity: (parentId, title, entityType) => {
        const form = get().form;
        if (!form) return;

        const updatedForm = deepClone(form);
        const parent = findNodeRecursive(updatedForm, parentId);

        if (parent && 'children' in parent) {
          const newEntity = createDefaultEntity(title, entityType);
          (parent.children as FormNode[]).push(newEntity);
          set({ form: updatedForm, selectedNodeId: newEntity.id });
          get().saveToHistory();
        }
      },

      addConditionSet: (parentId) => {
        const form = get().form;
        if (!form) return;

        const updatedForm = deepClone(form);
        const parent = findNodeRecursive(updatedForm, parentId);

        if (parent && 'children' in parent) {
          const newConditionSet = createDefaultConditionSet();
          (parent.children as FormNode[]).push(newConditionSet);
          set({ form: updatedForm, selectedNodeId: newConditionSet.id });
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

        // Find and remove from current parent
        const currentParent = findParentRecursive(updatedForm, nodeId);
        if (!currentParent || !('children' in currentParent)) return;

        const currentChildren = currentParent.children as FormNode[];
        const currentIndex = currentChildren.findIndex((c) => c.id === nodeId);
        if (currentIndex === -1) return;

        const [movedNode] = currentChildren.splice(currentIndex, 1);

        // Add to new parent
        const newParent = findNodeRecursive(updatedForm, targetParentId);
        if (!newParent || !('children' in newParent)) return;

        const newChildren = newParent.children as FormNode[];
        newChildren.splice(index, 0, movedNode);

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
      generateId,

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
    }),
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
