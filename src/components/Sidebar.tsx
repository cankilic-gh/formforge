'use client';

import { useFormStore } from '@/stores/formStore';
import {
  FolderOpen,
  Folder,
  Layers,
  GitBranch,
  GitMerge,
  CircleDot,
  MessageSquare,
  Type,
  ListChecks,
  AlertTriangle,
  FileInput,
  FileText,
  StickyNote,
  Link,
  MapPin,
  CheckSquare,
  User,
} from 'lucide-react';

interface ToolItem {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  action?: () => void;
  disabled?: boolean;
}

export const Sidebar: React.FC = () => {
  const {
    form,
    selectedNodeId,
    findNodeById,
    addSection,
    addSubSection,
    addQuestion,
    addEntity,
    addConditionSet,
    addConditional,
    addOption,
    addDescription,
    addWarning,
    addNote,
  } = useFormStore();

  const selectedNode = selectedNodeId ? findNodeById(selectedNodeId) : null;
  const selectedNodeType = selectedNode?.nodeType;

  // Check if we can add children to selected node
  const canAddToSelected = selectedNodeType && [
    'questionnaire',
    'section',
    'subsection',
    'entity',
    'conditionset',
    'conditional',
  ].includes(selectedNodeType);

  const handleAddSection = () => {
    if (!form) return;
    const title = prompt('Section title:', 'New Section');
    if (title) addSection(title);
  };

  const handleAddSubsection = () => {
    if (!selectedNodeId || selectedNodeType !== 'section') return;
    const title = prompt('Subsection title:', 'New Subsection');
    if (title) addSubSection(selectedNodeId, title);
  };

  const handleAddEntity = (type: 'single' | 'addmore') => {
    if (!selectedNodeId || !canAddToSelected) return;
    const title = prompt('Entity title:', type === 'addmore' ? 'New Repeatable Group' : 'New Group');
    if (title) addEntity(selectedNodeId, title, type);
  };

  const handleAddQuestion = () => {
    if (!selectedNodeId || !canAddToSelected) return;
    addQuestion(selectedNodeId, 'radio');
  };

  const handleAddConditionSet = () => {
    if (!selectedNodeId || !canAddToSelected) return;
    addConditionSet(selectedNodeId);
  };

  const handleAddConditional = () => {
    if (!selectedNodeId || selectedNodeType !== 'conditionset') return;
    addConditional(selectedNodeId);
  };

  const handleAddOption = () => {
    if (!selectedNodeId || selectedNodeType !== 'question') return;
    const selectedQuestion = selectedNode as { type?: string };
    if (!['radio', 'radioseperate', 'select'].includes(selectedQuestion.type || '')) return;
    const text = prompt('Option text:', 'New Option');
    if (text) {
      const value = text.toLowerCase().replace(/\s+/g, '_');
      addOption(selectedNodeId, value, text);
    }
  };

  const handleAddDescription = () => {
    if (!selectedNodeId || !canAddToSelected) return;
    const text = prompt('Description text:', '');
    if (text) addDescription(selectedNodeId, text);
  };

  const handleAddWarning = () => {
    if (!selectedNodeId || !canAddToSelected) return;
    const text = prompt('Warning text:', '');
    if (text) addWarning(selectedNodeId, text);
  };

  const handleAddNote = () => {
    if (!selectedNodeId || !canAddToSelected) return;
    const text = prompt('Note text:', '');
    if (text) addNote(selectedNodeId, text);
  };

  const tools: ToolItem[] = [
    {
      id: 'section',
      label: 'Section',
      icon: FolderOpen,
      color: 'text-green-400',
      action: handleAddSection,
      disabled: !form,
    },
    {
      id: 'subsection',
      label: 'Subsection',
      icon: Folder,
      color: 'text-teal-400',
      action: handleAddSubsection,
      disabled: selectedNodeType !== 'section',
    },
    {
      id: 'entity',
      label: 'Entity',
      icon: Layers,
      color: 'text-purple-400',
      action: () => handleAddEntity('single'),
      disabled: !canAddToSelected,
    },
    {
      id: 'entity-addmore',
      label: 'Entity (Addmore)',
      icon: ListChecks,
      color: 'text-purple-500',
      action: () => handleAddEntity('addmore'),
      disabled: !canAddToSelected,
    },
    {
      id: 'conditionset',
      label: 'Condition Set',
      icon: GitBranch,
      color: 'text-yellow-400',
      action: handleAddConditionSet,
      disabled: !canAddToSelected,
    },
    {
      id: 'conditional',
      label: 'Conditional',
      icon: GitMerge,
      color: 'text-yellow-500',
      action: handleAddConditional,
      disabled: selectedNodeType !== 'conditionset',
    },
    {
      id: 'question',
      label: 'Question',
      icon: CircleDot,
      color: 'text-blue-400',
      action: handleAddQuestion,
      disabled: !canAddToSelected,
    },
    {
      id: 'option',
      label: 'Option',
      icon: CheckSquare,
      color: 'text-blue-300',
      action: handleAddOption,
      disabled: selectedNodeType !== 'question' || !['radio', 'radioseperate', 'select'].includes((selectedNode as { type?: string })?.type || ''),
    },
    {
      id: 'description',
      label: 'Description',
      icon: MessageSquare,
      color: 'text-gray-400',
      action: handleAddDescription,
      disabled: !canAddToSelected,
    },
    {
      id: 'simpletext',
      label: 'Simple Text',
      icon: Type,
      color: 'text-gray-500',
      action: handleAddDescription,
      disabled: !canAddToSelected,
    },
    {
      id: 'warning',
      label: 'Warning',
      icon: AlertTriangle,
      color: 'text-red-400',
      action: handleAddWarning,
      disabled: !canAddToSelected,
    },
    {
      id: 'note',
      label: 'Note',
      icon: StickyNote,
      color: 'text-orange-400',
      action: handleAddNote,
      disabled: !canAddToSelected,
    },
    {
      id: 'validation',
      label: 'Validation',
      icon: CheckSquare,
      color: 'text-emerald-400',
      action: () => {},
      disabled: selectedNodeType !== 'questionnaire',
    },
    {
      id: 'includeform',
      label: 'Include Form',
      icon: FileInput,
      color: 'text-cyan-400',
      action: () => {},
      disabled: !canAddToSelected,
    },
    {
      id: 'requireddoc',
      label: 'Required Doc',
      icon: FileText,
      color: 'text-pink-400',
      action: () => {},
      disabled: !canAddToSelected,
    },
    {
      id: 'profilereference',
      label: 'Profile Reference',
      icon: User,
      color: 'text-indigo-400',
      action: () => selectedNodeId && canAddToSelected && addQuestion(selectedNodeId, 'profilereference'),
      disabled: !canAddToSelected,
    },
    {
      id: 'reference',
      label: 'Reference',
      icon: Link,
      color: 'text-sky-400',
      action: () => {},
      disabled: selectedNodeType !== 'question',
    },
    {
      id: 'addressset',
      label: 'Address Set',
      icon: MapPin,
      color: 'text-rose-400',
      action: () => {},
      disabled: !canAddToSelected,
    },
  ];

  return (
    <aside className="w-56 border-r border-white/5 flex flex-col overflow-hidden bg-black/20">
      {/* Header */}
      <div className="p-3 border-b border-white/5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Tools
        </h2>
      </div>

      {/* Tools list */}
      <div className="flex-1 overflow-auto p-2">
        <div className="space-y-0.5">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={tool.action}
                disabled={tool.disabled}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors
                  ${tool.disabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }
                `}
              >
                <Icon className={`w-4 h-4 ${tool.disabled ? 'text-gray-700' : tool.color}`} />
                {tool.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Context info */}
      <div className="p-3 border-t border-white/5 bg-black/20">
        <p className="text-[10px] text-gray-600">
          {selectedNode ? (
            <>Selected: <span className="text-gray-400">{selectedNodeType}</span></>
          ) : (
            'Select a node to add elements'
          )}
        </p>
      </div>
    </aside>
  );
};
