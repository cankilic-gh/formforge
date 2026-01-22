'use client';

import { useFormStore } from '@/stores/formStore';
import { useModal } from '@/components/Modal';
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
  Sun,
  Hammer,
  Save,
  Eye,
  EyeOff,
  Wand2,
} from 'lucide-react';
import { useRef } from 'react';

interface ToolbarProps {
  onGenerateClick?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onGenerateClick }) => {
  const {
    form,
    setForm,
    selectedNodeId,
    undo,
    redo,
    history,
    historyIndex,
    deleteNode,
    findNodeById,
    isPreviewing,
    togglePreview,
    regenerateAllIds,
  } = useFormStore();

  const { showAlert, showConfirm, showPrompt } = useModal();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Management
  const handleNew = async () => {
    if (form) {
      const confirmed = await showConfirm('New Form', 'Create new form? Unsaved changes will be lost.');
      if (!confirmed) return;
    }
    const title = await showPrompt('New Form', 'Enter form title:', 'Character & Fitness Questionnaire');
    if (title) {
      setForm(createEmptyForm(title));
    }
  };

  const handleOpen = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const xml = event.target?.result as string;
      const parsed = parseXML(xml);
      if (parsed) {
        setForm(parsed);
      } else {
        await showAlert('Error', 'Failed to parse XML file. Please check the file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleReload = async () => {
    if (!form) return;
    const confirmed = await showConfirm('Reload Form', 'Reload form? All unsaved changes will be lost.');
    if (confirmed && history.length > 0) {
      setForm(history[0]);
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

  const handleSaveAs = async () => {
    if (!form) return;
    const defaultName = `${form.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xml`;
    const filename = await showPrompt('Save As', 'Enter filename:', defaultName);
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

  const handleClose = async () => {
    if (!form) return;
    const confirmed = await showConfirm('Close Form', 'Close form? Unsaved changes will be lost.');
    if (confirmed) {
      setForm(null);
    }
  };

  // Edit
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleCut = async () => {
    if (selectedNodeId) {
      handleCopy();
      await handleDelete();
    }
  };

  const handleCopy = () => {
    if (!selectedNodeId) return;
    const node = findNodeById(selectedNodeId);
    if (node) {
      localStorage.setItem('formforge-clipboard', JSON.stringify(node));
    }
  };

  const handlePaste = async () => {
    const clipboardData = localStorage.getItem('formforge-clipboard');
    if (clipboardData) {
      await showAlert('Coming Soon', 'Paste functionality coming soon');
    }
  };

  const handleDelete = async () => {
    if (!selectedNodeId) return;
    const node = findNodeById(selectedNodeId);
    if (node?.nodeType === 'questionnaire') {
      await showAlert('Error', 'Cannot delete the root questionnaire');
      return;
    }
    const confirmed = await showConfirm('Delete Node', 'Delete selected node and all its children?');
    if (confirmed) {
      deleteNode(selectedNodeId);
    }
  };

  const handleRegenerateIds = async () => {
    if (!form) return;
    const confirmed = await showConfirm('Regenerate IDs', 'Regenerate all IDs? This will assign new unique IDs to all nodes.');
    if (confirmed) {
      regenerateAllIds();
    }
  };

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      {/* Main toolbar */}
      <div className="h-12 flex items-center px-2 gap-1">
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 border-r border-slate-200 mr-2">
          <Hammer className="w-5 h-5 text-cyan-600" />
          <span className="font-bold text-slate-800 text-sm tracking-wide">FormForge</span>
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

        <div className="w-px h-6 bg-slate-200 mx-1" />

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

        <div className="w-px h-6 bg-slate-200 mx-1" />

        {/* Tools */}
        <ToolbarGroup label="Tools">
          <ToolbarButton
            icon={Wand2}
            label="Generate"
            onClick={onGenerateClick || (() => {})}
            disabled={!form}
          />
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
          <ToolbarButton icon={Sun} label="Light Mode" onClick={() => {}} active />
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
      <div className="h-5 flex items-center px-2 text-[10px] text-slate-400 border-t border-slate-100 bg-slate-50">
        <div className="w-[140px]" /> {/* Logo space */}
        <span className="px-2">File Management</span>
        <span className="px-8">Edit</span>
        <span className="px-2 text-cyan-600 font-medium">Tools</span>
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
      flex flex-col items-center justify-center px-2 py-1 rounded-lg transition-colors min-w-[50px]
      ${disabled
        ? 'opacity-30 cursor-not-allowed'
        : danger
          ? 'hover:bg-red-50 text-slate-500 hover:text-red-600'
          : active
            ? 'bg-cyan-50 text-cyan-600'
            : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
      }
    `}
  >
    <Icon className="w-4 h-4" />
    <span className="text-[9px] mt-0.5 whitespace-nowrap">{label}</span>
  </button>
);
