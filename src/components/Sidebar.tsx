'use client';

import { useFormStore } from '@/stores/formStore';
import { QUESTION_TYPE_META } from '@/types/form';
import {
  Type,
  AlignLeft,
  Hash,
  Circle,
  ChevronDown,
  Calendar,
  MapPin,
  Globe,
  GraduationCap,
  PenTool,
  Info,
  FolderPlus,
  Layers,
  GitBranch,
  List,
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  Type,
  AlignLeft,
  Hash,
  Circle,
  CircleDot: Circle,
  ChevronDown,
  Calendar,
  CalendarPlus: Calendar,
  CalendarMinus: Calendar,
  Clock: Calendar,
  MapPin,
  Globe,
  Map: MapPin,
  Mail: Type,
  GraduationCap,
  Building: GraduationCap,
  PenTool,
  User: Type,
  FileText: Type,
  Info,
};

export const Sidebar: React.FC = () => {
  const { form, selectedNodeId, addSection, addQuestion, addEntity, addConditionSet } = useFormStore();

  const handleDragStart = (e: React.DragEvent, type: string, data: string) => {
    e.dataTransfer.setData('application/formforge-type', type);
    e.dataTransfer.setData('application/formforge-data', data);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const groupedTypes = {
    text: QUESTION_TYPE_META.filter((t) => t.category === 'text'),
    selection: QUESTION_TYPE_META.filter((t) => t.category === 'selection'),
    date: QUESTION_TYPE_META.filter((t) => t.category === 'date'),
    location: QUESTION_TYPE_META.filter((t) => t.category === 'location'),
    special: QUESTION_TYPE_META.filter((t) => t.category === 'special'),
  };

  return (
    <aside className="w-64 border-r border-white/5 flex flex-col overflow-hidden bg-black/20">
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Components
        </h2>
      </div>

      {/* Components list */}
      <div className="flex-1 overflow-auto p-2 space-y-4">
        {/* Structure */}
        <div>
          <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-2 mb-2">
            Structure
          </h3>
          <div className="space-y-1">
            <button
              onClick={() => form && addSection('New Section')}
              disabled={!form}
              draggable
              onDragStart={(e) => handleDragStart(e, 'section', 'New Section')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30"
            >
              <FolderPlus className="w-4 h-4 text-forge-green" />
              Section
            </button>

            <button
              onClick={() => selectedNodeId && addEntity(selectedNodeId, 'New Entity', 'single')}
              disabled={!selectedNodeId}
              draggable
              onDragStart={(e) => handleDragStart(e, 'entity', 'single')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30"
            >
              <Layers className="w-4 h-4 text-forge-purple" />
              Entity (Single)
            </button>

            <button
              onClick={() => selectedNodeId && addEntity(selectedNodeId, 'New Repeatable', 'addmore')}
              disabled={!selectedNodeId}
              draggable
              onDragStart={(e) => handleDragStart(e, 'entity', 'addmore')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30"
            >
              <List className="w-4 h-4 text-forge-purple" />
              Entity (Addmore)
            </button>

            <button
              onClick={() => selectedNodeId && addConditionSet(selectedNodeId)}
              disabled={!selectedNodeId}
              draggable
              onDragStart={(e) => handleDragStart(e, 'conditionset', '')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30"
            >
              <GitBranch className="w-4 h-4 text-forge-yellow" />
              Condition Set
            </button>
          </div>
        </div>

        {/* Question Types */}
        {Object.entries(groupedTypes).map(([category, types]) => (
          <div key={category}>
            <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-2 mb-2">
              {category}
            </h3>
            <div className="space-y-1">
              {types.map((meta) => {
                const Icon = iconMap[meta.icon] || Type;
                return (
                  <button
                    key={meta.type}
                    onClick={() => selectedNodeId && addQuestion(selectedNodeId, meta.type)}
                    disabled={!selectedNodeId}
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'question', meta.type)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Icon className="w-4 h-4 text-blue-400" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Help text */}
      <div className="p-4 border-t border-white/5">
        <p className="text-[10px] text-gray-600">
          {selectedNodeId
            ? 'Click or drag to add component'
            : 'Select a node to add components'}
        </p>
      </div>
    </aside>
  );
};
