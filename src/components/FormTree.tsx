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
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
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

// ─── Types ───────────────────────────────────────────────────

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  nodeId: string | null;
}

interface FlatTreeItem {
  id: string;
  node: FormNode;
  depth: number;
  parentId: string | null;
}

interface DropTarget {
  nodeId: string;
  position: 'before' | 'after' | 'inside';
  depth: number;
  targetParentId: string;
  targetIndex: number;
}

// ─── Helpers ─────────────────────────────────────────────────

const stripHtml = (html: string): string => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
};

const HIDDEN_TYPES = ['option', 'reference', 'answer'];

const isNodeVisible = (child: FormNode, parentType: string): boolean => {
  if (HIDDEN_TYPES.includes(child.nodeType)) return false;
  if (child.nodeType === 'description' && parentType === 'question') return false;
  return true;
};

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

const isDescendantOf = (root: FormNode, targetId: string): boolean => {
  if (root.id === targetId) return true;
  if ('children' in root && Array.isArray(root.children)) {
    return (root.children as FormNode[]).some(c => isDescendantOf(c, targetId));
  }
  return false;
};

// Build flat list of visible tree items
const buildFlatTree = (
  node: FormNode,
  depth: number,
  parentId: string | null,
  expandedNodes: Set<string>,
  activeId: string | null,
  parentType: string | null,
): FlatTreeItem[] => {
  if (HIDDEN_TYPES.includes(node.nodeType)) return [];
  if (parentType && !isNodeVisible(node, parentType)) return [];

  const items: FlatTreeItem[] = [{ id: node.id, node, depth, parentId }];

  // Don't expand dragged node's children (prevent self-drop)
  if (node.id === activeId) return items;

  if ('children' in node && Array.isArray(node.children) && expandedNodes.has(node.id)) {
    for (const child of node.children as FormNode[]) {
      items.push(...buildFlatTree(child, depth + 1, node.id, expandedNodes, activeId, node.nodeType));
    }
  }

  return items;
};

// Find actual index of a node in its parent's real children array
const findActualIndex = (parent: FormNode, childId: string): number => {
  if (!('children' in parent) || !Array.isArray(parent.children)) return 0;
  return (parent.children as FormNode[]).findIndex(c => c.id === childId);
};

// ─── Node display helpers ────────────────────────────────────

const getNodeIcon = (node: FormNode): React.ReactNode => {
  const iconClass = 'w-4 h-4';
  switch (node.nodeType) {
    case 'questionnaire': return <FileText className={`${iconClass} text-cyan-600`} />;
    case 'subform': return <FileText className={`${iconClass} text-cyan-500`} />;
    case 'section': return <FolderOpen className={`${iconClass} text-green-600`} />;
    case 'subsection': return <Folder className={`${iconClass} text-teal-600`} />;
    case 'question': {
      const q = node as FormQuestion;
      if (q.type === 'radio' || q.type === 'radioseperate') return <CircleDot className={`${iconClass} text-blue-600`} />;
      if (q.type === 'select') return <List className={`${iconClass} text-blue-600`} />;
      if (q.type.includes('date')) return <Calendar className={`${iconClass} text-blue-600`} />;
      if (q.type === 'state' || q.type === 'country' || q.type === 'zip') return <MapPin className={`${iconClass} text-blue-600`} />;
      if (q.type === 'signature') return <CheckCircle2 className={`${iconClass} text-blue-600`} />;
      return <Type className={`${iconClass} text-blue-600`} />;
    }
    case 'entity': return (node as FormEntity).type === 'addmore'
      ? <Layers className={`${iconClass} text-purple-600`} />
      : <Layers className={`${iconClass} text-purple-500`} />;
    case 'conditionset': return <GitBranch className={`${iconClass} text-amber-600`} />;
    case 'conditionlogic': return <GitBranch className={`${iconClass} text-amber-700`} />;
    case 'conditional': return <GitBranch className={`${iconClass} text-amber-500`} />;
    case 'warning': return <AlertCircle className={`${iconClass} text-red-600`} />;
    case 'note':
    case 'description': return <Info className={`${iconClass} text-slate-500`} />;
    case 'simpletext': return <Type className={`${iconClass} text-slate-600`} />;
    case 'validator': return <CheckCircle2 className={`${iconClass} text-emerald-600`} />;
    case 'unknown': return <FileText className={`${iconClass} text-rose-400`} />;
    case 'includeform': return <FileInput className={`${iconClass} text-indigo-600`} />;
    case 'required-doc': return <FileCheck className={`${iconClass} text-orange-600`} />;
    default: return <FileText className={`${iconClass} text-slate-500`} />;
  }
};

const getNodeLabel = (node: FormNode): string => {
  switch (node.nodeType) {
    case 'questionnaire': return (node as { title: string }).title;
    case 'subform': return (node as FormSubform).title;
    case 'section':
    case 'subsection': return (node as FormSection | FormSubSection).title;
    case 'question': {
      const q = node as FormQuestion;
      const desc = q.children.find((c) => c.nodeType === 'description');
      return desc ? (desc as { text: string }).text : `[${q.type}]`;
    }
    case 'entity': return (node as FormEntity).title || 'Entity';
    case 'conditionset': return `Condition (${(node as FormConditionSet).operator.toUpperCase()})`;
    case 'conditionlogic': return `ConditionLogic (${(node as FormConditionLogic).operator.toUpperCase()})`;
    case 'conditional': return `If ${(node as { condition: string }).condition}`;
    case 'warning':
    case 'note':
    case 'description':
    case 'simpletext': return (node as { text: string }).text || node.nodeType;
    case 'validator': {
      const cls = (node as { validatorClass: string }).validatorClass || 'Validator';
      return `Validator: ${cls.split('.').pop()}`;
    }
    case 'unknown': return `<${(node as { tagName: string }).tagName}> (preserved)`;
    case 'includeform': return (node as { title: string }).title || 'Include Form';
    case 'required-doc': return (node as { title: string }).title || 'Required Document';
    default: return node.nodeType;
  }
};

const getReferenceLabel = (node: FormNode): string | null => {
  if (node.nodeType !== 'question') return null;
  const q = node as FormQuestion;
  if (q.type !== 'profilereference') return null;
  const ref = q.children.find(c => c.nodeType === 'reference') as { field?: string } | undefined;
  const fieldValue = ref?.field || q.format;
  if (!fieldValue) return null;
  const fieldInfo = PROFILE_REFERENCE_FIELDS.find(f => f.value === fieldValue);
  return fieldInfo ? fieldInfo.label : fieldValue;
};

const getNodeBadge = (node: FormNode): string | null => {
  switch (node.nodeType) {
    case 'question': return (node as FormQuestion).type;
    case 'entity': return (node as FormEntity).type;
    case 'conditionset': return (node as FormConditionSet).operator;
    default: return null;
  }
};

const getBadgeClass = (nodeType: string): string => {
  switch (nodeType) {
    case 'question': return 'badge-question';
    case 'entity': return 'badge-entity';
    case 'conditionset':
    case 'conditional': return 'badge-conditionset';
    case 'section': return 'badge-section';
    case 'subsection': return 'badge-subsection';
    default: return '';
  }
};

// ─── Drop Indicator ──────────────────────────────────────────

const DropLine: React.FC<{ depth: number }> = ({ depth }) => (
  <div className="relative h-1 -my-0.5 z-10 pointer-events-none" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
    <div className="absolute top-1/2 -translate-y-1/2 rounded-full bg-cyan-500 w-2.5 h-2.5 border-2 border-white shadow-sm"
         style={{ left: `${depth * 16 + 2}px` }} />
    <div className="h-0.5 bg-cyan-500 rounded-full ml-2" />
  </div>
);

// ─── Tree Node ───────────────────────────────────────────────

interface TreeNodeProps {
  node: FormNode;
  depth: number;
  parentId: string | null;
  dropTarget: DropTarget | null;
  onContextMenu: (e: React.MouseEvent, nodeId: string) => void;
}

const SortableTreeNode: React.FC<TreeNodeProps> = ({ node, depth, parentId, dropTarget, onContextMenu }) => {
  const { selectedNodeId, selectNode, expandedNodes, toggleNodeExpanded, deleteNode, duplicateNode, addSubSection } = useFormStore();
  const { showConfirm, showPrompt } = useModal();

  const canDrag = node.nodeType !== 'questionnaire' && node.nodeType !== 'subform';

  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: node.id,
    disabled: !canDrag,
    data: { node, parentId, depth },
  });

  const isSelected = selectedNodeId === node.id;
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = 'children' in node && Array.isArray(node.children) && node.children.length > 0;

  const handleClick = (e: React.MouseEvent) => { e.stopPropagation(); selectNode(node.id); };
  const handleToggle = (e: React.MouseEvent) => { e.stopPropagation(); toggleNodeExpanded(node.id); };
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (await showConfirm('Delete Node', 'Delete this node and all its children?')) deleteNode(node.id);
  };
  const handleDuplicate = (e: React.MouseEvent) => { e.stopPropagation(); duplicateNode(node.id); };
  const handleAddSubSection = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.nodeType === 'section') {
      const title = await showPrompt('New Subsection', 'Enter subsection title:', 'New Subsection');
      if (title) addSubSection(node.id, title);
    }
  };

  if (HIDDEN_TYPES.includes(node.nodeType)) return null;

  const badge = getNodeBadge(node);
  const isDropInside = dropTarget?.nodeId === node.id && dropTarget.position === 'inside';
  const showBefore = dropTarget?.nodeId === node.id && dropTarget.position === 'before';
  const showAfter = dropTarget?.nodeId === node.id && dropTarget.position === 'after';

  const visibleChildren = hasChildren
    ? (node as { children: FormNode[] }).children.filter(c => isNodeVisible(c, node.nodeType))
    : [];

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.3 : 1 }}>
      {/* Drop line BEFORE */}
      {showBefore && <DropLine depth={dropTarget!.depth} />}

      {/* Node row */}
      <div
        className={`relative flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded-lg group border-l-2 transition-all duration-150 ${
          isSelected ? 'bg-cyan-50 border-l-cyan-500 shadow-sm' : 'border-l-transparent hover:bg-slate-50'
        } ${isDragging ? 'opacity-30' : ''} ${isDropInside ? 'ring-2 ring-cyan-500 ring-inset bg-cyan-50/50' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node.id)}
      >
        {canDrag && (
          <button
            className="w-3 h-3 text-slate-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-3 h-3" />
          </button>
        )}

        <button
          onClick={handleToggle}
          className={`w-4 h-4 flex items-center justify-center ${hasChildren ? 'opacity-100' : 'opacity-0'}`}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
        </button>

        {getNodeIcon(node)}

        <div className="flex-1 min-w-0">
          <span className={`block text-sm leading-snug ${
            node.nodeType === 'question' && (node as FormQuestion).required
              ? 'text-red-600 font-medium'
              : isSelected ? 'text-slate-900 font-medium' : 'text-slate-700'
          }`}>
            {stripHtml(getNodeLabel(node))}
          </span>
          {getReferenceLabel(node) && (
            <span className="block text-[10px] text-indigo-500">{getReferenceLabel(node)}</span>
          )}
        </div>

        {badge && <span className={`badge ${getBadgeClass(node.nodeType)}`}>{badge}</span>}

        <div className="hidden group-hover:flex items-center gap-1">
          {node.nodeType === 'section' && (
            <button onClick={handleAddSubSection} className="p-1 hover:bg-slate-200 rounded" title="Add Subsection">
              <Plus className="w-3 h-3 text-slate-500" />
            </button>
          )}
          <button onClick={handleDuplicate} className="p-1 hover:bg-slate-200 rounded" title="Duplicate">
            <Copy className="w-3 h-3 text-slate-500" />
          </button>
          {canDrag && (
            <button onClick={handleDelete} className="p-1 hover:bg-red-100 rounded" title="Delete">
              <Trash2 className="w-3 h-3 text-red-500" />
            </button>
          )}
        </div>
      </div>

      {/* Children — NO nested SortableContext */}
      {hasChildren && isExpanded && visibleChildren.map(child => (
        <SortableTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          parentId={node.id}
          dropTarget={dropTarget}
          onContextMenu={onContextMenu}
        />
      ))}

      {/* Drop line AFTER (shows after entire subtree) */}
      {showAfter && <DropLine depth={dropTarget!.depth} />}
    </div>
  );
};

// ─── Drag Overlay ────────────────────────────────────────────

const DragOverlayNode: React.FC<{ node: FormNode }> = ({ node }) => (
  <div className="flex items-center gap-1 py-1.5 px-3 rounded-lg bg-white shadow-lg border border-cyan-300" style={{ minWidth: '200px' }}>
    <GripVertical className="w-3 h-3 text-cyan-500" />
    {getNodeIcon(node)}
    <span className="text-sm text-slate-700 truncate">{stripHtml(getNodeLabel(node))}</span>
    {getNodeBadge(node) && <span className={`badge ${getBadgeClass(node.nodeType)}`}>{getNodeBadge(node)}</span>}
  </div>
);

// ─── FormTree ────────────────────────────────────────────────

export const FormTree: React.FC = () => {
  const { form, copyNode, pasteNode, canPaste, selectNode, moveNode, findNodeById, findParentNode, expandedNodes } = useFormStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<FormNode | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0, nodeId: null });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, { currentCoordinates }) => {
        switch (event.code) {
          case 'ArrowUp': return { ...currentCoordinates, y: currentCoordinates.y - 25 };
          case 'ArrowDown': return { ...currentCoordinates, y: currentCoordinates.y + 25 };
          default: return currentCoordinates;
        }
      },
    })
  );

  // Build flat tree for SortableContext IDs
  const flatItems = useMemo(() => {
    if (!form) return [];
    return buildFlatTree(form, 0, null, expandedNodes, activeId, null);
  }, [form, expandedNodes, activeId]);

  const sortableIds = useMemo(() => flatItems.map(i => i.id), [flatItems]);

  // Close context menu on click/escape
  useEffect(() => {
    const handleClick = () => { if (contextMenu.isOpen) setContextMenu(c => ({ ...c, isOpen: false })); };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && contextMenu.isOpen) setContextMenu(c => ({ ...c, isOpen: false })); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('click', handleClick); document.removeEventListener('keydown', handleKeyDown); };
  }, [contextMenu.isOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault(); e.stopPropagation();
    selectNode(nodeId);
    setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, nodeId });
  }, [selectNode]);

  const handleCopy = useCallback(() => {
    if (contextMenu.nodeId) copyNode(contextMenu.nodeId);
    setContextMenu(c => ({ ...c, isOpen: false }));
  }, [contextMenu.nodeId, copyNode]);

  const handlePaste = useCallback(() => {
    if (contextMenu.nodeId) pasteNode(contextMenu.nodeId);
    setContextMenu(c => ({ ...c, isOpen: false }));
  }, [contextMenu.nodeId, pasteNode]);

  // ─── DnD Handlers ───────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const node = findNodeById(event.active.id as string);
    if (node) {
      setActiveId(event.active.id as string);
      setActiveNode(node);
    }
  }, [findNodeById]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) { setDropTarget(null); return; }

    const dragNode = findNodeById(active.id as string);
    const overNode = findNodeById(over.id as string);
    if (!dragNode || !overNode) { setDropTarget(null); return; }

    // Prevent dropping into own descendants
    if (isDescendantOf(dragNode, over.id as string)) { setDropTarget(null); return; }

    // Current pointer Y
    const overRect = over.rect;
    const initialY = event.activatorEvent instanceof MouseEvent
      ? event.activatorEvent.clientY
      : (event.activatorEvent as TouchEvent)?.touches?.[0]?.clientY ?? 0;
    const pointerY = initialY + (event.delta?.y ?? 0);
    const relativeY = pointerY - overRect.top;
    const height = overRect.height;
    const ratio = Math.max(0, Math.min(1, relativeY / height));

    // Find over node in flat list for context
    const overFlat = flatItems.find(f => f.id === over.id);
    if (!overFlat) { setDropTarget(null); return; }

    const overParentId = overFlat.parentId;
    const overParent = overParentId ? findNodeById(overParentId) : null;
    const overIsExpanded = expandedNodes.has(overNode.id);
    const overHasVisibleChildren = 'children' in overNode && Array.isArray(overNode.children) &&
      (overNode.children as FormNode[]).some(c => isNodeVisible(c, overNode.nodeType));

    const canInside = canAcceptChild(overNode.nodeType, dragNode.nodeType);
    const canSibling = overParent ? canAcceptChild(overParent.nodeType, dragNode.nodeType) : false;

    let position: 'before' | 'after' | 'inside';
    let targetParentId: string;
    let targetIndex: number;
    let indicatorDepth: number;

    if (ratio < 0.3 && canSibling && overParentId && overParent) {
      // ── BEFORE ──
      position = 'before';
      targetParentId = overParentId;
      targetIndex = findActualIndex(overParent, overNode.id);
      indicatorDepth = overFlat.depth;
    } else if (ratio > 0.7 && canInside && overIsExpanded && overHasVisibleChildren) {
      // ── INSIDE as first child (expanded container) ──
      position = 'inside';
      targetParentId = overNode.id;
      targetIndex = 0;
      indicatorDepth = overFlat.depth + 1;
    } else if (ratio > 0.7 && canSibling && overParentId && overParent) {
      // ── AFTER ──
      position = 'after';
      targetParentId = overParentId;
      targetIndex = findActualIndex(overParent, overNode.id) + 1;
      indicatorDepth = overFlat.depth;
    } else if (canInside) {
      // ── INSIDE (middle zone or fallback) ──
      position = 'inside';
      targetParentId = overNode.id;
      // Insert after last hidden child (so visible items stay at end)
      if ('children' in overNode && Array.isArray(overNode.children)) {
        const children = overNode.children as FormNode[];
        let insertIdx = 0;
        // Skip hidden children at the start
        while (insertIdx < children.length && HIDDEN_TYPES.includes(children[insertIdx].nodeType)) {
          insertIdx++;
        }
        targetIndex = insertIdx;
      } else {
        targetIndex = 0;
      }
      indicatorDepth = overFlat.depth + 1;
    } else if (canSibling && overParentId && overParent) {
      // ── Fallback: before or after based on ratio ──
      if (ratio < 0.5) {
        position = 'before';
        targetIndex = findActualIndex(overParent, overNode.id);
      } else {
        position = 'after';
        targetIndex = findActualIndex(overParent, overNode.id) + 1;
      }
      targetParentId = overParentId;
      indicatorDepth = overFlat.depth;
    } else {
      setDropTarget(null);
      return;
    }

    // Adjust index for same-parent moves (source removal shifts indices)
    const activeParent = findParentNode(active.id as string);
    if (activeParent && activeParent.id === targetParentId && 'children' in activeParent) {
      const activeActualIdx = findActualIndex(activeParent, active.id as string);
      if (activeActualIdx !== -1 && activeActualIdx < targetIndex) {
        targetIndex--;
      }
    }

    setDropTarget({ nodeId: over.id as string, position, depth: indicatorDepth, targetParentId, targetIndex });
  }, [findNodeById, findParentNode, flatItems, expandedNodes]);

  const handleDragEnd = useCallback((_event: DragEndEvent) => {
    if (dropTarget && activeId) {
      moveNode(activeId, dropTarget.targetParentId, dropTarget.targetIndex);
    }
    setActiveId(null);
    setActiveNode(null);
    setDropTarget(null);
  }, [activeId, dropTarget, moveNode]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setActiveNode(null);
    setDropTarget(null);
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
      autoScroll={{ threshold: { x: 0, y: 0.15 }, interval: 10, acceleration: 5 }}
    >
      <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200 relative">
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <SortableTreeNode
            node={form}
            depth={0}
            parentId={null}
            dropTarget={dropTarget}
            onContextMenu={handleContextMenu}
          />
        </SortableContext>

        {/* Context Menu */}
        {contextMenu.isOpen && (
          <div
            className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={handleCopy} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2">
              <Copy className="w-4 h-4 text-slate-500" /> Copy
            </button>
            {showPaste && (
              <button onClick={handlePaste} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2">
                <Clipboard className="w-4 h-4 text-slate-500" /> Paste
              </button>
            )}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeNode ? <DragOverlayNode node={activeNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
};
