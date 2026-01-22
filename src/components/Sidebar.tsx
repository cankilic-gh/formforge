'use client';

import { useFormStore } from '@/stores/formStore';
import { useModal } from '@/components/Modal';
import { PROFILE_REFERENCE_FIELDS, ProfileReferenceField } from '@/types/form';
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
    addIncludeForm,
    addRequiredDoc,
    addAddressSet,
    addReference,
  } = useFormStore();

  const { showPrompt, showSelect } = useModal();

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

  const handleAddSection = async () => {
    if (!form) return;
    const title = await showPrompt('New Section', 'Enter section title:', 'New Section');
    if (title) addSection(title);
  };

  const handleAddSubsection = async () => {
    if (!selectedNodeId || selectedNodeType !== 'section') return;
    const title = await showPrompt('New Subsection', 'Enter subsection title:', 'New Subsection');
    if (title) addSubSection(selectedNodeId, title);
  };

  const handleAddEntity = async (type: 'single' | 'addmore') => {
    if (!selectedNodeId || !canAddToSelected) return;
    const defaultTitle = type === 'addmore' ? 'New Repeatable Group' : 'New Group';
    const title = await showPrompt('New Entity', 'Enter entity title:', defaultTitle);
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

  const handleAddOption = async () => {
    if (!selectedNodeId || selectedNodeType !== 'question') return;
    const selectedQuestion = selectedNode as { type?: string };
    if (!['radio', 'radioseperate', 'select'].includes(selectedQuestion.type || '')) return;
    const text = await showPrompt('New Option', 'Enter option text:', 'New Option');
    if (text) {
      const value = text.toLowerCase().replace(/\s+/g, '_');
      addOption(selectedNodeId, value, text);
    }
  };

  const handleAddDescription = async () => {
    if (!selectedNodeId || !canAddToSelected) return;
    const text = await showPrompt('New Description', 'Enter description text:', '');
    if (text) addDescription(selectedNodeId, text);
  };

  const handleAddWarning = async () => {
    if (!selectedNodeId || !canAddToSelected) return;
    const text = await showPrompt('New Warning', 'Enter warning text:', '');
    if (text) addWarning(selectedNodeId, text);
  };

  const handleAddNote = async () => {
    if (!selectedNodeId || !canAddToSelected) return;
    const text = await showPrompt('New Note', 'Enter note text:', '');
    if (text) addNote(selectedNodeId, text);
  };

  const handleAddIncludeForm = async () => {
    if (!selectedNodeId || !canAddToSelected) return;
    const formName = await showPrompt('New Include Form', 'Enter form name (e.g., affirmation.xml):', '');
    if (formName) {
      const title = await showPrompt('Include Form Title', 'Enter display title:', formName.replace('.xml', ''));
      if (title) addIncludeForm(selectedNodeId, formName, title);
    }
  };

  const handleAddRequiredDoc = async () => {
    if (!selectedNodeId || !canAddToSelected) return;
    const title = await showPrompt('New Required Document', 'Enter document title:', '');
    if (title) addRequiredDoc(selectedNodeId, title);
  };

  const handleAddReference = async () => {
    if (!selectedNodeId || selectedNodeType !== 'question') return;
    const options = PROFILE_REFERENCE_FIELDS.map(f => ({
      value: f.value,
      label: f.label,
      category: f.category,
    }));
    const field = await showSelect('Add Reference', 'Select which profile field to reference:', options, 'fullname');
    if (field) {
      addReference(selectedNodeId, field as ProfileReferenceField);
    }
  };

  const tools: ToolItem[] = [
    {
      id: 'section',
      label: 'Section',
      icon: FolderOpen,
      color: 'text-green-600',
      action: handleAddSection,
      disabled: !form,
    },
    {
      id: 'subsection',
      label: 'Subsection',
      icon: Folder,
      color: 'text-teal-600',
      action: handleAddSubsection,
      disabled: selectedNodeType !== 'section',
    },
    {
      id: 'entity',
      label: 'Entity',
      icon: Layers,
      color: 'text-purple-600',
      action: () => handleAddEntity('single'),
      disabled: !canAddToSelected,
    },
    {
      id: 'entity-addmore',
      label: 'Entity (Addmore)',
      icon: ListChecks,
      color: 'text-purple-700',
      action: () => handleAddEntity('addmore'),
      disabled: !canAddToSelected,
    },
    {
      id: 'conditionset',
      label: 'Condition Set',
      icon: GitBranch,
      color: 'text-amber-600',
      action: handleAddConditionSet,
      disabled: !canAddToSelected,
    },
    {
      id: 'conditional',
      label: 'Conditional',
      icon: GitMerge,
      color: 'text-amber-700',
      action: handleAddConditional,
      disabled: selectedNodeType !== 'conditionset',
    },
    {
      id: 'question',
      label: 'Question',
      icon: CircleDot,
      color: 'text-blue-600',
      action: handleAddQuestion,
      disabled: !canAddToSelected,
    },
    {
      id: 'option',
      label: 'Option',
      icon: CheckSquare,
      color: 'text-blue-500',
      action: handleAddOption,
      disabled: selectedNodeType !== 'question' || !['radio', 'radioseperate', 'select'].includes((selectedNode as { type?: string })?.type || ''),
    },
    {
      id: 'description',
      label: 'Description',
      icon: MessageSquare,
      color: 'text-slate-500',
      action: handleAddDescription,
      disabled: !canAddToSelected,
    },
    {
      id: 'simpletext',
      label: 'Simple Text',
      icon: Type,
      color: 'text-slate-600',
      action: handleAddDescription,
      disabled: !canAddToSelected,
    },
    {
      id: 'warning',
      label: 'Warning',
      icon: AlertTriangle,
      color: 'text-red-600',
      action: handleAddWarning,
      disabled: !canAddToSelected,
    },
    {
      id: 'note',
      label: 'Note',
      icon: StickyNote,
      color: 'text-orange-600',
      action: handleAddNote,
      disabled: !canAddToSelected,
    },
    {
      id: 'validation',
      label: 'Validation',
      icon: CheckSquare,
      color: 'text-emerald-600',
      action: () => {},
      disabled: selectedNodeType !== 'questionnaire',
    },
    {
      id: 'includeform',
      label: 'Include Form',
      icon: FileInput,
      color: 'text-indigo-600',
      action: handleAddIncludeForm,
      disabled: !canAddToSelected,
    },
    {
      id: 'requireddoc',
      label: 'Required Doc',
      icon: FileText,
      color: 'text-orange-600',
      action: handleAddRequiredDoc,
      disabled: !canAddToSelected,
    },
    {
      id: 'profilereference',
      label: 'Profile Reference',
      icon: User,
      color: 'text-indigo-600',
      action: () => selectedNodeId && canAddToSelected && addQuestion(selectedNodeId, 'profilereference'),
      disabled: !canAddToSelected,
    },
    {
      id: 'reference',
      label: 'Reference',
      icon: Link,
      color: 'text-sky-600',
      action: handleAddReference,
      disabled: selectedNodeType !== 'question',
    },
    {
      id: 'addressset',
      label: 'Address Set',
      icon: MapPin,
      color: 'text-rose-600',
      action: () => selectedNodeId && canAddToSelected && addAddressSet(selectedNodeId),
      disabled: !canAddToSelected,
    },
  ];

  return (
    <aside className="w-56 border-r border-slate-200 flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="p-3 border-b border-slate-100">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
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
                  w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors
                  ${tool.disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                  }
                `}
              >
                <Icon className={`w-4 h-4 ${tool.disabled ? 'text-slate-300' : tool.color}`} />
                {tool.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Context info */}
      <div className="p-3 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-500">
          {selectedNode ? (
            <>Selected: <span className="text-slate-700 font-medium">{selectedNodeType}</span></>
          ) : (
            'Select a node to add elements'
          )}
        </p>
      </div>
    </aside>
  );
};
