'use client';

import { useFormStore } from '@/stores/formStore';
import { parseXML, buildXML, createEmptyForm } from '@/lib/xmlParser';
import {
  FileUp,
  FileDown,
  FilePlus,
  RefreshCw,
  X,
  Undo2,
  Redo2,
  Scissors,
  Copy,
  Clipboard,
  Trash2,
  Hash,
  Settings,
  Moon,
  Hammer,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useRef } from 'react';

export const Toolbar: React.FC = () => {
  const {
    form,
    setForm,
    selectedNodeId,
    undo,
    redo,
    history,
    historyIndex,
    deleteNode,
    duplicateNode,
    findNodeById,
    isPreviewing,
    togglePreview,
  } = useFormStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Management
  const handleNew = () => {
    if (form && !confirm('Create new form? Unsaved changes will be lost.')) return;
    const title = prompt('Form title:', 'Character & Fitness Questionnaire');
    if (title) {
      setForm(createEmptyForm(title));
    }
  };

  const handleOpen = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const xml = event.target?.result as string;
      const parsed = parseXML(xml);
      if (parsed) {
        setForm(parsed);
      } else {
        alert('Failed to parse XML file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleReload = () => {
    if (!form) return;
    if (confirm('Reload form? All unsaved changes will be lost.')) {
      // For now, just reset to initial state in history
      if (history.length > 0) {
        setForm(history[0]);
      }
    }
  };

  const handleSave = () => {
    if (!form) return;
    const xml = buildXML(form);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveAs = () => {
    if (!form) return;
    const filename = prompt('Save as:', `${form.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xml`);
    if (!filename) return;

    const xml = buildXML(form);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.xml') ? filename : `${filename}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    if (!form) return;
    if (confirm('Close form? Unsaved changes will be lost.')) {
      setForm(null);
    }
  };

  // Edit
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleCut = () => {
    // TODO: Implement cut (copy + delete)
    if (selectedNodeId) {
      handleCopy();
      handleDelete();
    }
  };

  const handleCopy = () => {
    if (!selectedNodeId) return;
    const node = findNodeById(selectedNodeId);
    if (node) {
      localStorage.setItem('formforge-clipboard', JSON.stringify(node));
    }
  };

  const handlePaste = () => {
    // TODO: Implement paste
    const clipboardData = localStorage.getItem('formforge-clipboard');
    if (clipboardData) {
      alert('Paste functionality coming soon');
    }
  };

  const handleDelete = () => {
    if (!selectedNodeId) return;
    const node = findNodeById(selectedNodeId);
    if (node?.nodeType === 'questionnaire') {
      alert('Cannot delete the root questionnaire');
      return;
    }
    if (confirm('Delete selected node and all its children?')) {
      deleteNode(selectedNodeId);
    }
  };

  const handleRegenerateIds = () => {
    // TODO: Implement regenerate IDs
    alert('Regenerate IDs functionality coming soon');
  };

  return (
    <header className="border-b border-white/5 bg-black/30">
      {/* Main toolbar */}
      <div className="h-12 flex items-center px-2 gap-1">
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 border-r border-white/10 mr-2">
          <Hammer className="w-5 h-5 text-forge-cyan" />
          <span className="font-bold text-white text-sm tracking-wide">FormForge</span>
        </div>

        {/* File Management */}
        <ToolbarGroup label="File Management">
          <ToolbarButton icon={FilePlus} label="New" onClick={handleNew} />
          <ToolbarButton icon={FileUp} label="Open" onClick={handleOpen} />
          <ToolbarButton icon={RefreshCw} label="Reload" onClick={handleReload} disabled={!form} />
          <ToolbarButton icon={Save} label="Save" onClick={handleSave} disabled={!form} />
          <ToolbarButton icon={FileDown} label="Save As" onClick={handleSaveAs} disabled={!form} />
          <ToolbarButton icon={X} label="Close" onClick={handleClose} disabled={!form} />
        </ToolbarGroup>

        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* Edit */}
        <ToolbarGroup label="Edit">
          <ToolbarButton icon={Undo2} label="Undo" onClick={undo} disabled={!canUndo} />
          <ToolbarButton icon={Redo2} label="Redo" onClick={redo} disabled={!canRedo} />
          <ToolbarButton icon={Scissors} label="Cut" onClick={handleCut} disabled={!selectedNodeId} />
          <ToolbarButton icon={Copy} label="Copy" onClick={handleCopy} disabled={!selectedNodeId} />
          <ToolbarButton icon={Clipboard} label="Paste" onClick={handlePaste} disabled={!selectedNodeId} />
          <ToolbarButton icon={Trash2} label="Delete" onClick={handleDelete} disabled={!selectedNodeId} danger />
          <ToolbarButton icon={Hash} label="Regenerate Id's" onClick={handleRegenerateIds} disabled={!form} />
        </ToolbarGroup>

        {/* Spacer */}
        <div className="flex-1" />

        {/* View */}
        <ToolbarGroup label="View">
          <ToolbarButton
            icon={isPreviewing ? EyeOff : Eye}
            label={isPreviewing ? 'Editor' : 'Preview'}
            onClick={togglePreview}
            disabled={!form}
            active={isPreviewing}
          />
          <ToolbarButton icon={Settings} label="Settings" onClick={() => {}} />
          <ToolbarButton icon={Moon} label="Dark Mode" onClick={() => {}} active />
        </ToolbarGroup>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Section labels */}
      <div className="h-5 flex items-center px-2 text-[10px] text-gray-600 border-t border-white/5 bg-black/20">
        <div className="w-[140px]" /> {/* Logo space */}
        <span className="px-2">File Management</span>
        <div className="flex-1" />
        <span className="px-2">Edit</span>
        <div className="flex-1" />
        <span className="px-2">View</span>
      </div>
    </header>
  );
};

// Toolbar Group
const ToolbarGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-0.5">
    {children}
  </div>
);

// Toolbar Button
interface ToolbarButtonProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  active = false,
  danger = false,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={label}
    className={`
      flex flex-col items-center justify-center px-2 py-1 rounded transition-colors min-w-[50px]
      ${disabled
        ? 'opacity-30 cursor-not-allowed'
        : danger
          ? 'hover:bg-red-500/10 text-gray-400 hover:text-red-400'
          : active
            ? 'bg-forge-cyan/10 text-forge-cyan'
            : 'hover:bg-white/5 text-gray-400 hover:text-white'
      }
    `}
  >
    <Icon className="w-4 h-4" />
    <span className="text-[9px] mt-0.5 whitespace-nowrap">{label}</span>
  </button>
);
