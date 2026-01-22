'use client';

import { useFormStore } from '@/stores/formStore';
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
} from 'lucide-react';

const getNodeIcon = (node: FormNode): React.ReactNode => {
  const iconClass = 'w-4 h-4';

  switch (node.nodeType) {
    case 'questionnaire':
      return <FileText className={`${iconClass} text-forge-cyan`} />;
    case 'section':
      return <FolderOpen className={`${iconClass} text-forge-green`} />;
    case 'subsection':
      return <Folder className={`${iconClass} text-teal-400`} />;
    case 'question': {
      const q = node as FormQuestion;
      if (q.type === 'radio' || q.type === 'radioseperate') {
        return <CircleDot className={`${iconClass} text-blue-400`} />;
      }
      if (q.type === 'select') {
        return <List className={`${iconClass} text-blue-400`} />;
      }
      if (q.type.includes('date')) {
        return <Calendar className={`${iconClass} text-blue-400`} />;
      }
      if (q.type === 'state' || q.type === 'country' || q.type === 'zip') {
        return <MapPin className={`${iconClass} text-blue-400`} />;
      }
      if (q.type === 'signature') {
        return <CheckCircle2 className={`${iconClass} text-blue-400`} />;
      }
      return <Type className={`${iconClass} text-blue-400`} />;
    }
    case 'entity': {
      const e = node as FormEntity;
      return e.type === 'addmore' ? (
        <Layers className={`${iconClass} text-forge-purple`} />
      ) : (
        <Layers className={`${iconClass} text-purple-400`} />
      );
    }
    case 'conditionset':
      return <GitBranch className={`${iconClass} text-forge-yellow`} />;
    case 'conditional':
      return <GitBranch className={`${iconClass} text-yellow-600`} />;
    case 'warning':
      return <AlertCircle className={`${iconClass} text-forge-red`} />;
    case 'note':
    case 'description':
      return <Info className={`${iconClass} text-gray-500`} />;
    default:
      return <FileText className={`${iconClass} text-gray-500`} />;
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

interface TreeNodeProps {
  node: FormNode;
  depth: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth }) => {
  const {
    selectedNodeId,
    selectNode,
    expandedNodes,
    toggleNodeExpanded,
    deleteNode,
    duplicateNode,
    addSubSection,
  } = useFormStore();

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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this node and all its children?')) {
      deleteNode(node.id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateNode(node.id);
  };

  const handleAddSubSection = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.nodeType === 'section') {
      const title = prompt('Subsection title:', 'New Subsection');
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

  return (
    <div>
      <div
        className={`tree-item flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded-md group ${
          isSelected ? 'selected' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={handleToggle}
          className={`w-4 h-4 flex items-center justify-center ${
            hasChildren ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-gray-500" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-500" />
          )}
        </button>

        {/* Icon */}
        {getNodeIcon(node)}

        {/* Label */}
        <span className="flex-1 truncate text-sm text-gray-300">
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
          <span className="text-forge-red text-xs">*</span>
        )}

        {/* Actions (visible on hover) */}
        <div className="hidden group-hover:flex items-center gap-1">
          {node.nodeType === 'section' && (
            <button
              onClick={handleAddSubSection}
              className="p-1 hover:bg-white/10 rounded"
              title="Add Subsection"
            >
              <Plus className="w-3 h-3 text-gray-400" />
            </button>
          )}
          <button
            onClick={handleDuplicate}
            className="p-1 hover:bg-white/10 rounded"
            title="Duplicate"
          >
            <Copy className="w-3 h-3 text-gray-400" />
          </button>
          {node.nodeType !== 'questionnaire' && (
            <button
              onClick={handleDelete}
              className="p-1 hover:bg-red-500/20 rounded"
              title="Delete"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {(node as { children: FormNode[] }).children
            .filter((c) => !['description', 'option', 'reference', 'answer'].includes(c.nodeType))
            .map((child) => (
              <TreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
};

export const FormTree: React.FC = () => {
  const { form } = useFormStore();

  if (!form) return null;

  return (
    <div className="glass-panel rounded-lg p-2">
      <TreeNode node={form} depth={0} />
    </div>
  );
};
