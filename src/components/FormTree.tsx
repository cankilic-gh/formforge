'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFormStore } from '@/stores/formStore';
import { useModal } from '@/components/Modal';
import { FormNode, FormQuestion, FormEntity, FormConditionSet, FormConditionLogic, FormSection, FormSubSection, FormSubform, PROFILE_REFERENCE_FIELDS } from '@/types/form';
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
  Clipboard,
} from 'lucide-react';

// Context menu state
interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  nodeId: string | null;
}

// Drag state for overlay
interface ActiveDragState {
  id: string;
  node: FormNode;
}

const getNodeIcon = (node: FormNode): React.ReactNode => {
  const iconClass = 'w-4 h-4';

  switch (node.nodeType) {
    case 'questionnaire':
      return <FileText className={`${iconClass} text-cyan-600`} />;
    case 'subform':
      return <FileText className={`${iconClass} text-cyan-500`} />;
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
    case 'conditionlogic':
      return <GitBranch className={`${iconClass} text-amber-700`} />;
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
    case 'subform':
      return (node as FormSubform).title;
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
    case 'conditionlogic': {
      const cl = node as FormConditionLogic;
      return `ConditionLogic (${cl.operator.toUpperCase()})`;
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

// Get reference field label for profilereference questions
const getReferenceLabel = (node: FormNode): string | null => {
  if (node.nodeType !== 'question') return null;
  const q = node as FormQuestion;
  if (q.type !== 'profilereference') return null;

  // Find reference child
  const ref = q.children.find(c => c.nodeType === 'reference') as { field?: string } | undefined;
  const fieldValue = ref?.field || q.format;

  if (!fieldValue) return null;

  const fieldInfo = PROFILE_REFERENCE_FIELDS.find(f => f.value === fieldValue);
  return fieldInfo ? fieldInfo.label : fieldValue;
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
    subform: ['question', 'entity', 'conditionset', 'conditionlogic', 'description', 'warning', 'note', 'includeform', 'required-doc'],
    section: ['subsection'],
    subsection: ['question', 'entity', 'conditionset', 'conditionlogic', 'description', 'warning', 'note', 'includeform', 'required-doc'],
    entity: ['question', 'entity', 'conditionset', 'conditionlogic', 'description', 'warning', 'note', 'includeform', 'required-doc'],
    conditionset: ['question', 'conditional', 'description', 'warning', 'note', 'required-doc'],
    conditionlogic: ['question', 'entity', 'conditionset', 'conditionlogic', 'conditional', 'description', 'warning', 'note', 'includeform', 'required-doc'],
    conditional: ['question', 'entity', 'conditionset', 'conditionlogic', 'description', 'warning', 'note', 'includeform', 'required-doc'],
  };
  return rules[parentType]?.includes(childType) || false;
};

interface SortableTreeNodeProps {
  node: FormNode;
  depth: number;
  parentId: string | null;
  index: number;
  onContextMenu: (e: React.MouseEvent, nodeId: string) => void;
  isDragOverlay?: boolean;
  isOver?: boolean;
  overPosition?: 'before' | 'after' | 'inside' | null;
}

const SortableTreeNode: React.FC<SortableTreeNodeProps> = ({
  node,
  depth,
  parentId,
  index,
  onContextMenu,
  isDragOverlay = false,
  isOver = false,
  overPosition = null,
}) => {
  const {
    selectedNodeId,
    selectNode,
    expandedNodes,
    toggleNodeExpanded,
    deleteNode,
    duplicateNode,
    addSubSection,
  } = useFormStore();

  const { showConfirm, showPrompt } = useModal();

  const canDrag = node.nodeType !== 'questionnaire' && node.nodeType !== 'subform';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    disabled: !canDrag,
    data: {
      node,
      parentId,
      index,
      depth,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isSelected = selectedNodeId === node.id;
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = 'children' in node && Array.isArray(node.children) && node.children.length > 0;

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

  // Don't show certain node types in tree
  if (['description', 'option', 'reference', 'answer'].includes(node.nodeType)) {
    return null;
  }

  const badge = getNodeBadge(node);

  // Drop indicator styles
  const getDropIndicatorStyle = () => {
    if (!isOver || !overPosition) return '';

    switch (overPosition) {
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

  // Filter visible children
  const visibleChildren = hasChildren
    ? (node as { children: FormNode[] }).children.filter(
        (c) => !['description', 'option', 'reference', 'answer'].includes(c.nodeType)
      )
    : [];

  return (
    <div ref={!isDragOverlay ? setNodeRef : undefined} style={!isDragOverlay ? style : undefined}>
      <div
        className={`relative flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded-lg group border-l-2 transition-all duration-150 ${
          isSelected
            ? 'bg-cyan-50 border-l-cyan-500 shadow-sm'
            : 'border-l-transparent hover:bg-slate-50'
        } ${isDragging ? 'opacity-50' : ''} ${getDropIndicatorStyle()} ${isDragOverlay ? 'bg-white shadow-lg border border-slate-200' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node.id)}
      >
        {/* Drag handle */}
        {canDrag && (
          <button
            className="w-3 h-3 text-slate-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-3 h-3" />
          </button>
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
        <div className="flex-1 min-w-0">
          <span className={`block truncate text-sm ${
            node.nodeType === 'question' && (node as FormQuestion).required
              ? 'text-red-600 font-medium'
              : isSelected ? 'text-slate-900 font-medium' : 'text-slate-700'
          }`}>
            {getNodeLabel(node)}
          </span>
          {getReferenceLabel(node) && (
            <span className="block truncate text-[10px] text-indigo-500">
              {getReferenceLabel(node)}
            </span>
          )}
        </div>

        {/* Badge */}
        {badge && (
          <span className={`badge ${getBadgeClass(node.nodeType)}`}>
            {badge}
          </span>
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
          {node.nodeType !== 'questionnaire' && node.nodeType !== 'subform' && (
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
      {hasChildren && isExpanded && !isDragOverlay && (
        <SortableContext
          items={visibleChildren.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {visibleChildren.map((child, idx) => (
            <SortableTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              parentId={node.id}
              index={idx}
              onContextMenu={onContextMenu}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
};

// Drag overlay component (rendered outside sortable context)
const DragOverlayNode: React.FC<{ node: FormNode; depth: number }> = ({ node, depth }) => {
  return (
    <div
      className="flex items-center gap-1 py-1.5 px-2 rounded-lg bg-white shadow-lg border border-cyan-300"
      style={{ paddingLeft: `${depth * 16 + 8}px`, minWidth: '200px' }}
    >
      <GripVertical className="w-3 h-3 text-cyan-500" />
      {getNodeIcon(node)}
      <span className="text-sm text-slate-700 truncate">{getNodeLabel(node)}</span>
      {getNodeBadge(node) && (
        <span className={`badge ${getBadgeClass(node.nodeType)}`}>
          {getNodeBadge(node)}
        </span>
      )}
    </div>
  );
};

export const FormTree: React.FC = () => {
  const { form, copyNode, pasteNode, canPaste, selectNode, moveNode, findNodeById, findParentNode, expandedNodes } = useFormStore();
  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);
  const [overInfo, setOverInfo] = useState<{
    id: string;
    position: 'before' | 'after' | 'inside';
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    nodeId: null,
  });

  // Configure sensors for different input types
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, { currentCoordinates }) => {
        // Basic keyboard navigation for drag
        switch (event.code) {
          case 'ArrowUp':
            return { ...currentCoordinates, y: currentCoordinates.y - 25 };
          case 'ArrowDown':
            return { ...currentCoordinates, y: currentCoordinates.y + 25 };
          default:
            return currentCoordinates;
        }
      },
    })
  );

  // Collect all sortable IDs from the tree
  const collectSortableIds = useCallback((node: FormNode): string[] => {
    const ids: string[] = [];

    // Skip hidden node types
    if (['description', 'option', 'reference', 'answer'].includes(node.nodeType)) {
      return ids;
    }

    ids.push(node.id);

    if ('children' in node && Array.isArray(node.children) && expandedNodes.has(node.id)) {
      for (const child of node.children) {
        ids.push(...collectSortableIds(child as FormNode));
      }
    }

    return ids;
  }, [expandedNodes]);

  const sortableIds = useMemo(() => {
    if (!form) return [];
    return collectSortableIds(form);
  }, [form, collectSortableIds]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => {
      if (contextMenu.isOpen) {
        setContextMenu({ ...contextMenu, isOpen: false });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu.isOpen) {
        setContextMenu({ ...contextMenu, isOpen: false });
      }
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    selectNode(nodeId);
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      nodeId,
    });
  }, [selectNode]);

  const handleCopy = useCallback(() => {
    if (contextMenu.nodeId) {
      copyNode(contextMenu.nodeId);
    }
    setContextMenu({ ...contextMenu, isOpen: false });
  }, [contextMenu, copyNode]);

  const handlePaste = useCallback(() => {
    if (contextMenu.nodeId) {
      pasteNode(contextMenu.nodeId);
    }
    setContextMenu({ ...contextMenu, isOpen: false });
  }, [contextMenu, pasteNode]);

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const node = findNodeById(active.id as string);
    if (node) {
      setActiveDrag({ id: active.id as string, node });
    }
  }, [findNodeById]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setOverInfo(null);
      return;
    }

    const activeNode = findNodeById(active.id as string);
    const overNode = findNodeById(over.id as string);
    if (!activeNode || !overNode) {
      setOverInfo(null);
      return;
    }

    // Get collision rect to determine position
    const overData = event.over?.data.current as { parentId?: string; index?: number } | undefined;
    const overParentId = overData?.parentId;
    const overParent = overParentId ? findNodeById(overParentId) : null;

    // Determine drop position based on pointer position
    const overRect = over.rect;
    const pointerY = event.activatorEvent instanceof MouseEvent
      ? event.activatorEvent.clientY
      : (event.activatorEvent as TouchEvent)?.touches?.[0]?.clientY ?? 0;

    const relativeY = pointerY - overRect.top;
    const height = overRect.height;

    let position: 'before' | 'after' | 'inside' = 'inside';
    const canAcceptInside = canAcceptChild(overNode.nodeType, activeNode.nodeType);
    const canAcceptSibling = overParent ? canAcceptChild(overParent.nodeType, activeNode.nodeType) : false;

    if (relativeY < height * 0.25 && canAcceptSibling) {
      position = 'before';
    } else if (relativeY > height * 0.75 && canAcceptSibling) {
      position = 'after';
    } else if (canAcceptInside) {
      position = 'inside';
    } else if (relativeY < height * 0.5 && canAcceptSibling) {
      position = 'before';
    } else if (canAcceptSibling) {
      position = 'after';
    } else {
      setOverInfo(null);
      return;
    }

    setOverInfo({ id: over.id as string, position });
  }, [findNodeById]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    setOverInfo(null);

    if (!over || active.id === over.id) return;

    const activeNode = findNodeById(active.id as string);
    const overNode = findNodeById(over.id as string);
    if (!activeNode || !overNode) return;

    const overData = event.over?.data.current as { parentId?: string; index?: number } | undefined;
    const overParentId = overData?.parentId;
    const overIndex = overData?.index ?? 0;

    if (!overInfo) return;

    const { position } = overInfo;

    if (position === 'inside') {
      // Move as first child of overNode
      if (canAcceptChild(overNode.nodeType, activeNode.nodeType)) {
        moveNode(active.id as string, over.id as string, 0);
      }
    } else if (overParentId) {
      // Move as sibling
      const targetParent = findNodeById(overParentId);
      if (targetParent && canAcceptChild(targetParent.nodeType, activeNode.nodeType)) {
        let targetIndex = position === 'before' ? overIndex : overIndex + 1;

        // Adjust index if moving within same parent
        const activeParent = findParentNode(active.id as string);
        if (activeParent && activeParent.id === overParentId && 'children' in activeParent) {
          const children = (activeParent as { children: FormNode[] }).children;
          const activeIndex = children.findIndex((c) => c.id === active.id);
          if (activeIndex !== -1 && activeIndex < overIndex) {
            targetIndex--;
          }
        }

        moveNode(active.id as string, overParentId, targetIndex);
      }
    }
  }, [findNodeById, findParentNode, moveNode, overInfo]);

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
    setOverInfo(null);
  }, []);

  if (!form) return null;

  const showPaste = contextMenu.nodeId ? canPaste(contextMenu.nodeId) : false;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200 relative">
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <SortableTreeNode
            node={form}
            depth={0}
            parentId={null}
            index={0}
            onContextMenu={handleContextMenu}
            isOver={overInfo?.id === form.id}
            overPosition={overInfo?.id === form.id ? overInfo.position : null}
          />
        </SortableContext>

        {/* Context Menu */}
        {contextMenu.isOpen && (
          <div
            className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCopy}
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
            >
              <Copy className="w-4 h-4 text-slate-500" />
              Copy
            </button>
            {showPaste && (
              <button
                onClick={handlePaste}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
              >
                <Clipboard className="w-4 h-4 text-slate-500" />
                Paste
              </button>
            )}
          </div>
        )}
      </div>

      {/* Drag Overlay - renders the dragged item */}
      <DragOverlay dropAnimation={{
        duration: 200,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}>
        {activeDrag ? (
          <DragOverlayNode
            node={activeDrag.node}
            depth={0}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
