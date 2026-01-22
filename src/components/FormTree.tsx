'use client';

import { useState } from 'react';
import { useFormStore } from '@/stores/formStore';
import { useModal } from '@/components/Modal';
import { FormNode, FormQuestion, FormEntity, FormConditionSet, FormSection, FormSubSection } from '@/types/form';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FolderOpen,
  Folder,
  CircleDot,
  Layers,
  GitBranch,
  AlertCircle,
  Info,
  Type,
  Calendar,
  List,
  CheckCircle2,
  MapPin,
  Trash2,
  Copy,
  Plus,
  GripVertical,
  FileInput,
  FileCheck,
} from 'lucide-react';

// Drag state
interface DragState {
  draggedNodeId: string | null;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after' | 'inside' | null;
}

const getNodeIcon = (node: FormNode): React.ReactNode => {
  const iconClass = 'w-4 h-4';

  switch (node.nodeType) {
    case 'questionnaire':
      return <FileText className={`${iconClass} text-cyan-600`} />;
    case 'section':
      return <FolderOpen className={`${iconClass} text-green-600`} />;
    case 'subsection':
      return <Folder className={`${iconClass} text-teal-600`} />;
    case 'question': {
      const q = node as FormQuestion;
      if (q.type === 'radio' || q.type === 'radioseperate') {
        return <CircleDot className={`${iconClass} text-blue-600`} />;
      }
      if (q.type === 'select') {
        return <List className={`${iconClass} text-blue-600`} />;
      }
      if (q.type.includes('date')) {
        return <Calendar className={`${iconClass} text-blue-600`} />;
      }
      if (q.type === 'state' || q.type === 'country' || q.type === 'zip') {
        return <MapPin className={`${iconClass} text-blue-600`} />;
      }
      if (q.type === 'signature') {
        return <CheckCircle2 className={`${iconClass} text-blue-600`} />;
      }
      return <Type className={`${iconClass} text-blue-600`} />;
    }
    case 'entity': {
      const e = node as FormEntity;
      return e.type === 'addmore' ? (
        <Layers className={`${iconClass} text-purple-600`} />
      ) : (
        <Layers className={`${iconClass} text-purple-500`} />
      );
    }
    case 'conditionset':
      return <GitBranch className={`${iconClass} text-amber-600`} />;
    case 'conditional':
      return <GitBranch className={`${iconClass} text-amber-500`} />;
    case 'warning':
      return <AlertCircle className={`${iconClass} text-red-600`} />;
    case 'note':
    case 'description':
      return <Info className={`${iconClass} text-slate-500`} />;
    case 'includeform':
      return <FileInput className={`${iconClass} text-indigo-600`} />;
    case 'required-doc':
      return <FileCheck className={`${iconClass} text-orange-600`} />;
    default:
      return <FileText className={`${iconClass} text-slate-500`} />;
  }
};

const getNodeLabel = (node: FormNode): string => {
  switch (node.nodeType) {
    case 'questionnaire':
      return (node as { title: string }).title;
    case 'section':
    case 'subsection':
      return (node as FormSection | FormSubSection).title;
    case 'question': {
      const q = node as FormQuestion;
      const desc = q.children.find((c) => c.nodeType === 'description');
      const text = desc ? (desc as { text: string }).text : '';
      const truncated = text.length > 50 ? text.substring(0, 50) + '...' : text;
      return truncated || `[${q.type}]`;
    }
    case 'entity':
      return (node as FormEntity).title || 'Entity';
    case 'conditionset': {
      const cs = node as FormConditionSet;
      return `Condition (${cs.operator.toUpperCase()})`;
    }
    case 'conditional': {
      const cond = node as { condition: string };
      return `If ${cond.condition}`;
    }
    case 'warning':
    case 'note':
    case 'description':
      return (node as { text: string }).text?.substring(0, 40) || node.nodeType;
    case 'includeform':
      return (node as { title: string }).title || 'Include Form';
    case 'required-doc':
      return (node as { title: string }).title || 'Required Document';
    default:
      return node.nodeType;
  }
};

const getNodeBadge = (node: FormNode): string | null => {
  switch (node.nodeType) {
    case 'question':
      return (node as FormQuestion).type;
    case 'entity':
      return (node as FormEntity).type;
    case 'conditionset':
      return (node as FormConditionSet).operator;
    default:
      return null;
  }
};

const getBadgeClass = (nodeType: string): string => {
  switch (nodeType) {
    case 'question':
      return 'badge-question';
    case 'entity':
      return 'badge-entity';
    case 'conditionset':
    case 'conditional':
      return 'badge-conditionset';
    case 'section':
      return 'badge-section';
    case 'subsection':
      return 'badge-subsection';
    default:
      return '';
  }
};

// Check if a node can accept children of a certain type
const canAcceptChild = (parentType: string, childType: string): boolean => {
  const rules: Record<string, string[]> = {
    questionnaire: ['section'],
    section: ['subsection'],
    subsection: ['question', 'entity', 'conditionset', 'description', 'warning', 'note', 'includeform', 'required-doc'],
    entity: ['question', 'entity', 'conditionset', 'description', 'warning', 'note', 'includeform', 'required-doc'],
    conditionset: ['question', 'conditional', 'description', 'warning', 'note', 'required-doc'],
    conditional: ['question', 'entity', 'conditionset', 'description', 'warning', 'note', 'includeform', 'required-doc'],
  };
  return rules[parentType]?.includes(childType) || false;
};

interface TreeNodeProps {
  node: FormNode;
  depth: number;
  dragState: DragState;
  setDragState: (state: DragState) => void;
  parentId: string | null;
  index: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth, dragState, setDragState, parentId, index }) => {
  const {
    selectedNodeId,
    selectNode,
    expandedNodes,
    toggleNodeExpanded,
    deleteNode,
    duplicateNode,
    addSubSection,
    moveNode,
    findNodeById,
    findParentNode,
  } = useFormStore();

  const { showConfirm, showPrompt } = useModal();

  const isSelected = selectedNodeId === node.id;
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = 'children' in node && Array.isArray(node.children) && node.children.length > 0;
  const isDragging = dragState.draggedNodeId === node.id;
  const isDropTarget = dragState.dropTargetId === node.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(node.id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeExpanded(node.id);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await showConfirm('Delete Node', 'Delete this node and all its children?');
    if (confirmed) {
      deleteNode(node.id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateNode(node.id);
  };

  const handleAddSubSection = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.nodeType === 'section') {
      const title = await showPrompt('New Subsection', 'Enter subsection title:', 'New Subsection');
      if (title) {
        addSubSection(node.id, title);
      }
    }
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent) => {
    if (node.nodeType === 'questionnaire') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);
    setDragState({ draggedNodeId: node.id, dropTargetId: null, dropPosition: null });
  };

  const handleDragEnd = () => {
    setDragState({ draggedNodeId: null, dropTargetId: null, dropPosition: null });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragState.draggedNodeId || dragState.draggedNodeId === node.id) return;

    const draggedNode = findNodeById(dragState.draggedNodeId);
    if (!draggedNode) return;

    // Calculate drop position based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: 'before' | 'after' | 'inside' | null = null;

    // Check if can accept as child (for 'inside' drop)
    const canAcceptInside = canAcceptChild(node.nodeType, draggedNode.nodeType);

    // Check if parent can accept this node (for 'before'/'after' drops)
    const targetParent = parentId ? findNodeById(parentId) : null;
    const canAcceptSibling = targetParent ? canAcceptChild(targetParent.nodeType, draggedNode.nodeType) : false;

    if (y < height * 0.25 && canAcceptSibling) {
      position = 'before';
    } else if (y > height * 0.75 && canAcceptSibling) {
      position = 'after';
    } else if (canAcceptInside) {
      position = 'inside';
    } else if (y < height * 0.5 && canAcceptSibling) {
      position = 'before';
    } else if (canAcceptSibling) {
      position = 'after';
    }

    if (position && (dragState.dropTargetId !== node.id || dragState.dropPosition !== position)) {
      setDragState({ ...dragState, dropTargetId: node.id, dropPosition: position });
    } else if (!position && dragState.dropTargetId === node.id) {
      setDragState({ ...dragState, dropTargetId: null, dropPosition: null });
    }
  };

  const handleDragLeave = () => {
    if (dragState.dropTargetId === node.id) {
      setDragState({ ...dragState, dropTargetId: null, dropPosition: null });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Capture current drag state before any changes
    const { draggedNodeId, dropPosition } = dragState;

    // Immediately clear drag state to prevent duplicate processing
    setDragState({ draggedNodeId: null, dropTargetId: null, dropPosition: null });

    // Validate we have what we need
    if (!draggedNodeId || !dropPosition) return;
    if (draggedNodeId === node.id) return;

    const draggedNode = findNodeById(draggedNodeId);
    if (!draggedNode) return;

    if (dropPosition === 'inside') {
      // Move inside this node (as first child)
      if (canAcceptChild(node.nodeType, draggedNode.nodeType)) {
        moveNode(draggedNodeId, node.id, 0);
      }
    } else if (parentId) {
      // Move before or after this node (sibling position)
      // First validate that the parent can accept this child type
      const targetParent = findNodeById(parentId);
      if (!targetParent || !canAcceptChild(targetParent.nodeType, draggedNode.nodeType)) return;

      let targetIndex = dropPosition === 'before' ? index : index + 1;

      // If moving within the same parent and dragged node comes before target,
      // we need to adjust the index since removing it will shift indices
      const draggedParent = findParentNode(draggedNodeId);
      if (draggedParent && draggedParent.id === parentId && 'children' in draggedParent) {
        const children = (draggedParent as { children: FormNode[] }).children;
        const draggedIndex = children.findIndex((c) => c.id === draggedNodeId);
        if (draggedIndex !== -1 && draggedIndex < index) {
          targetIndex--;
        }
      }

      moveNode(draggedNodeId, parentId, targetIndex);
    }
  };

  // Don't show certain node types in tree
  if (['description', 'option', 'reference', 'answer'].includes(node.nodeType)) {
    return null;
  }

  const badge = getNodeBadge(node);
  const canDrag = node.nodeType !== 'questionnaire';

  // Drop indicator styles
  const getDropIndicatorStyle = () => {
    if (!isDropTarget || !dragState.dropPosition) return '';

    switch (dragState.dropPosition) {
      case 'before':
        return 'before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-cyan-500';
      case 'after':
        return 'after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-cyan-500';
      case 'inside':
        return 'ring-2 ring-cyan-500 ring-inset';
      default:
        return '';
    }
  };

  return (
    <div>
      <div
        className={`relative flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded-lg group border-l-2 transition-all duration-150 ${
          isSelected
            ? 'bg-cyan-50 border-l-cyan-500 shadow-sm'
            : 'border-l-transparent hover:bg-slate-50'
        } ${isDragging ? 'opacity-50' : ''} ${getDropIndicatorStyle()}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        draggable={canDrag}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag handle */}
        {canDrag && (
          <GripVertical className="w-3 h-3 text-slate-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
        )}

        {/* Expand/collapse toggle */}
        <button
          onClick={handleToggle}
          className={`w-4 h-4 flex items-center justify-center ${
            hasChildren ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-slate-400" />
          )}
        </button>

        {/* Icon */}
        {getNodeIcon(node)}

        {/* Label */}
        <span className={`flex-1 truncate text-sm ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-700'}`}>
          {getNodeLabel(node)}
        </span>

        {/* Badge */}
        {badge && (
          <span className={`badge ${getBadgeClass(node.nodeType)}`}>
            {badge}
          </span>
        )}

        {/* Required indicator */}
        {node.nodeType === 'question' && (node as FormQuestion).required && (
          <span className="text-red-500 text-xs font-bold">*</span>
        )}

        {/* Actions (visible on hover) */}
        <div className="hidden group-hover:flex items-center gap-1">
          {node.nodeType === 'section' && (
            <button
              onClick={handleAddSubSection}
              className="p-1 hover:bg-slate-200 rounded"
              title="Add Subsection"
            >
              <Plus className="w-3 h-3 text-slate-500" />
            </button>
          )}
          <button
            onClick={handleDuplicate}
            className="p-1 hover:bg-slate-200 rounded"
            title="Duplicate"
          >
            <Copy className="w-3 h-3 text-slate-500" />
          </button>
          {node.nodeType !== 'questionnaire' && (
            <button
              onClick={handleDelete}
              className="p-1 hover:bg-red-100 rounded"
              title="Delete"
            >
              <Trash2 className="w-3 h-3 text-red-500" />
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {(node as { children: FormNode[] }).children
            .filter((c) => !['description', 'option', 'reference', 'answer'].includes(c.nodeType))
            .map((child, idx) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                dragState={dragState}
                setDragState={setDragState}
                parentId={node.id}
                index={idx}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export const FormTree: React.FC = () => {
  const { form } = useFormStore();
  const [dragState, setDragState] = useState<DragState>({
    draggedNodeId: null,
    dropTargetId: null,
    dropPosition: null,
  });

  if (!form) return null;

  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200">
      <TreeNode
        node={form}
        depth={0}
        dragState={dragState}
        setDragState={setDragState}
        parentId={null}
        index={0}
      />
    </div>
  );
};
