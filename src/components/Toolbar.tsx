'use client';

import { useFormStore } from '@/stores/formStore';
import { useModal } from '@/components/Modal';
import { parseAnyXML, buildAnyXML, createEmptyForm, createEmptySubform, detectXMLType } from '@/lib/xmlParser';
import {
  isFormDirty,
  loadReloadForm,
  resolveSavedBaselineAfterReload,
  shouldContinueAfterSave,
} from '@/lib/reloadSource';
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
  Hammer,
  Save,
  Eye,
  EyeOff,
  Wand2,
  Sparkles,
  Code,
  Check,
  FlaskConical,
} from 'lucide-react';
import { useRef, useState, useEffect } from 'react';

// Module-level storage to survive component remounts
let persistedFileHandle: FileSystemFileHandle | null = null;
let persistedFileName: string | null = null;

// Deploy timestamp in Florida (ET) time - baked in at build, always visible.
// Formatted in useEffect so server/client Intl differences can't break hydration.
const LastUpdated: React.FC = () => {
  const [time, setTime] = useState('');

  useEffect(() => {
    const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;
    if (!buildTime) return;
    setTime(new Date(buildTime).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true,
    }));
  }, []);

  if (!time) return null;
  return (
    <span className="text-[9px] text-slate-400 leading-none mt-0.5" title="Last deployed (ET)">
      {time} ET
    </span>
  );
};

interface ToolbarProps {
  onGenerateClick?: () => void;
  onAiFixClick?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onGenerateClick, onAiFixClick }) => {
  const {
    form,
    setForm,
    reloadBaselineXml,
    setReloadBaselineXml,
    selectedNodeId,
    undo,
    redo,
    history,
    historyIndex,
    savedBaselineXml,
    setSavedBaselineXml,
    deleteNode,
    findNodeById,
    isPreviewing,
    togglePreview,
    regenerateAllIds,
  } = useFormStore();

  const { showAlert, showConfirm, showPrompt } = useModal();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isXmlModalOpen, setIsXmlModalOpen] = useState(false);
  const [xmlContent, setXmlContent] = useState('');
  const [copied, setCopied] = useState(false);

  const hasUnsavedChanges = isFormDirty(form, savedBaselineXml);

  // Warn before closing tab/browser with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleShowXml = () => {
    if (!form) return;
    const xml = buildAnyXML(form);
    setXmlContent(xml);
    setIsXmlModalOpen(true);
    setCopied(false);
  };

  const handleCopyXml = async () => {
    await navigator.clipboard.writeText(xmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // File Management
  const handleNew = async () => {
    if (hasUnsavedChanges) {
      const saveRequested = await showConfirm('Unsaved Changes', 'You have unsaved changes. Do you want to save before creating a new form?');
      if (!await shouldContinueAfterSave(saveRequested, handleSave)) return;
    }

    // Ask for form type
    const formType = await showPrompt('Form Type', 'Enter "form" for questionnaire or "subform" for subform:', 'form');
    if (!formType) return;

    const isSubform = formType.toLowerCase() === 'subform';

    const title = await showPrompt(
      isSubform ? 'New Subform' : 'New Form',
      `Enter ${isSubform ? 'subform' : 'form'} title:`,
      isSubform ? 'New Subform' : 'Character and Fitness Questionnaire'
    );
    if (!title) return;

    const suffix = await showPrompt('Form Suffix', 'Enter form suffix (5 digits):', '00001');
    if (!suffix) return;

    persistedFileHandle = null;
    persistedFileName = null;
    setSavedBaselineXml(null);
    const newForm = isSubform ? createEmptySubform(title, suffix) : createEmptyForm(title, suffix);
    setReloadBaselineXml(buildAnyXML(newForm));
    setForm(newForm);
  };

  const handleOpen = async () => {
    if (hasUnsavedChanges) {
      const saveRequested = await showConfirm('Unsaved Changes', 'Do you want to save changes before opening another file?');
      if (!await shouldContinueAfterSave(saveRequested, handleSave)) return;
    }

    // Try File System Access API first
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as typeof window & { showOpenFilePicker: (options?: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
          types: [{
            description: 'XML Files',
            accept: { 'application/xml': ['.xml'] },
          }],
        });
        const file = await handle.getFile();
        const xml = await file.text();

        // Auto-detect XML type
        const xmlType = detectXMLType(xml);
        if (!xmlType) {
          await showAlert('Error', 'Could not detect XML type. File must contain a <questionnaire> or <subform> element.');
          return;
        }

        const parsed = parseAnyXML(xml);
        if (parsed) {
          persistedFileHandle = handle;
          persistedFileName = file.name;
          setReloadBaselineXml(buildAnyXML(parsed));
          setForm(parsed);
          setSavedBaselineXml(buildAnyXML(parsed));
        } else {
          await showAlert('Error', 'Failed to parse XML file. Please check the file format.');
        }
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Fallback to file input
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const xml = event.target?.result as string;

      // Auto-detect XML type
      const xmlType = detectXMLType(xml);
      if (!xmlType) {
        await showAlert('Error', 'Could not detect XML type. File must contain a <questionnaire> or <subform> element.');
        return;
      }

      const parsed = parseAnyXML(xml);
      if (parsed) {
        persistedFileHandle = null; // No handle for legacy file input
        persistedFileName = file.name;
        setReloadBaselineXml(buildAnyXML(parsed));
        setForm(parsed);
        setSavedBaselineXml(buildAnyXML(parsed));
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
    if (!confirmed) return;

    try {
      const reloaded = await loadReloadForm(persistedFileHandle, reloadBaselineXml);
      const baselineXml = buildAnyXML(reloaded);
      setReloadBaselineXml(baselineXml);
      setForm(reloaded);
      setSavedBaselineXml(resolveSavedBaselineAfterReload(
        savedBaselineXml,
        persistedFileHandle !== null,
        baselineXml
      ));
    } catch (err) {
      console.error('Failed to reload form:', err);
      await showAlert('Reload Failed', 'The source file could not be read or parsed. The current form was not changed.');
    }
  };

  const handleSave = async (): Promise<boolean> => {
    if (!form) return false;
    const xml = buildAnyXML(form);

    // If we have an existing file handle, save directly to it
    if (persistedFileHandle) {
      // Keep a reference for Save As's startIn hint below — the handle is
      // about to be nulled out on failure, but it still tells the picker
      // which folder the file lives in even though we can no longer write
      // through it directly (e.g. a revoked permission).
      const previousHandle = persistedFileHandle;
      try {
        const writable = await persistedFileHandle.createWritable();
        await writable.write(xml);
        await writable.close();
        setReloadBaselineXml(xml);
        setSavedBaselineXml(xml);
        return true;
      } catch (err) {
        // Handle might be invalid (e.g. permission revoked since Open) —
        // don't silently degrade to a different save location without
        // saying so, or the user will end up saving a fresh copy to
        // Downloads/Desktop instead of updating the file they opened.
        console.error('Failed to save to existing file:', err);
        persistedFileHandle = null;
        await showAlert(
          'Could Not Save In Place',
          "Couldn't write to the file you opened (its saved permission may have expired). " +
            "You'll be asked to choose where to save next — pick the SAME file to replace it."
        );
        return handleSaveAs(previousHandle);
      }
    }

    // No existing handle, do Save As
    return handleSaveAs();
  };

  const handleSaveAs = async (startInHandle?: FileSystemFileHandle): Promise<boolean> => {
    if (!form) return false;
    const xml = buildAnyXML(form);
    const defaultName = persistedFileName || `${form.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xml`;

    // Use File System Access API if available
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as typeof window & {
          showSaveFilePicker: (options?: object) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker({
          suggestedName: defaultName,
          // Opens in the same folder as the file we already had a handle
          // for, instead of wherever the browser last remembered (usually
          // Downloads/Desktop) — this is what makes "Save" land back in the
          // original folder instead of somewhere else.
          ...(startInHandle || persistedFileHandle ? { startIn: startInHandle ?? persistedFileHandle } : {}),
          types: [{
            description: 'XML Files',
            accept: { 'application/xml': ['.xml'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(xml);
        await writable.close();
        persistedFileHandle = handle;
        persistedFileName = handle.name;
        setReloadBaselineXml(xml);
        setSavedBaselineXml(xml);
        return true;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return false;
      }
    } else {
      // This browser has no File System Access API at all (Safari, Firefox)
      // — there is no way to write back to the original file. Say so before
      // downloading, or "saved" silently means "a new copy landed in
      // Downloads and the real file was never touched."
      await showAlert(
        'Direct Save Not Supported In This Browser',
        `Your browser can't save back to the original file — a new copy ("${defaultName}") will download to your ` +
          'Downloads folder instead. Move/replace it into the original folder yourself, or use Chrome or Edge for ' +
          'in-place saving.'
      );
    }

    // Fallback for browsers without File System Access API
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    setReloadBaselineXml(xml);
    setSavedBaselineXml(xml);
    return true;
  };

  const handleClose = async () => {
    if (!form) return;

    if (hasUnsavedChanges) {
      const saveRequested = await showConfirm('Unsaved Changes', 'Do you want to save changes before closing?');
      if (!await shouldContinueAfterSave(saveRequested, handleSave)) return;
    }

    persistedFileHandle = null;
    persistedFileName = null;
    setReloadBaselineXml(null);
    setSavedBaselineXml(null);
    setForm(null);
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
    // use the store's copyNode so the clipboard format matches pasteNode/canPaste
    useFormStore.getState().copyNode(selectedNodeId);
  };

  const handlePaste = async () => {
    const { pasteNode, canPaste } = useFormStore.getState();

    if (!selectedNodeId) {
      await showAlert('No Selection', 'Please select a node to paste into.');
      return;
    }

    // Check if clipboard has data
    const clipboardData = localStorage.getItem('formforge-clipboard');
    if (!clipboardData) {
      await showAlert('Empty Clipboard', 'Nothing to paste. Copy a node first.');
      return;
    }

    // Check if we can paste at the selected location
    if (!canPaste(selectedNodeId)) {
      await showAlert('Cannot Paste', 'The copied node cannot be pasted at this location. Check the node type compatibility.');
      return;
    }

    // Perform the paste
    pasteNode(selectedNodeId);
  };

  const handleDelete = async () => {
    if (!selectedNodeId) return;
    const node = findNodeById(selectedNodeId);
    if (node?.nodeType === 'questionnaire' || node?.nodeType === 'subform') {
      await showAlert('Error', 'Cannot delete the root element');
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
      {/* Main toolbar - each column owns both its icon row and its label cell */}
      <div className="flex items-stretch px-2 gap-1">
        {/* Logo - matches sidebar width (w-56 = 224px) */}
        <div className="w-56 flex flex-col border-r border-slate-200">
          <div className="h-12 flex items-center gap-2 px-3">
            <Hammer className="w-5 h-5 text-cyan-600" />
            <div className="flex flex-col">
              <span className="font-bold text-slate-800 text-sm tracking-wide leading-none">FormForge</span>
              <LastUpdated />
            </div>
          </div>
          <div className="h-5 bg-slate-50 border-t border-slate-100" />
        </div>

        {/* File Management */}
        <ToolbarGroup label="File Management">
          <ToolbarButton icon={FilePlus} label="New" onClick={handleNew} />
          <ToolbarButton icon={FileUp} label="Open" onClick={handleOpen} />
          <ToolbarButton icon={RefreshCw} label="Reload" onClick={handleReload} disabled={!form} />
          <ToolbarButton icon={Save} label="Save" onClick={handleSave} disabled={!form} warning={!!hasUnsavedChanges} />
          <ToolbarButton icon={FileDown} label="Save As" onClick={() => handleSaveAs()} disabled={!form} />
          <ToolbarButton icon={X} label="Close" onClick={handleClose} disabled={!form} />
        </ToolbarGroup>

        <ToolbarSeparator />

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

        <ToolbarSeparator />

        {/* Tools */}
        <ToolbarGroup label="Tools" labelClassName="text-cyan-600 font-medium">
          <ToolbarButton
            icon={Wand2}
            label="Generate"
            onClick={onGenerateClick || (() => {})}
            disabled={!form}
          />
          <ToolbarButton
            icon={Sparkles}
            label="AI Fix"
            onClick={onAiFixClick || (() => {})}
            disabled={!form}
          />
        </ToolbarGroup>

        {/* Spacer - keeps the label strip unbroken across the gap */}
        <div className="flex-1 flex flex-col">
          <div className="h-12" />
          <div className="h-5 bg-slate-50 border-t border-slate-100" />
        </div>

        {/* View */}
        <ToolbarGroup label="View">
          <ToolbarButton
            icon={isPreviewing ? EyeOff : Eye}
            label={isPreviewing ? 'Editor' : 'Preview'}
            onClick={togglePreview}
            disabled={!form}
            active={isPreviewing}
          />
          <ToolbarButton
            icon={Code}
            label="XML"
            onClick={handleShowXml}
            disabled={!form}
          />
          <ToolbarButton
            icon={FlaskConical}
            label="Test Lab"
            onClick={() => { window.location.href = '/test'; }}
          />
        </ToolbarGroup>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* XML Modal */}
      {isXmlModalOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setIsXmlModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[800px] max-h-[80vh] overflow-hidden border border-slate-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <Code className="w-5 h-5 text-cyan-600" />
              <h3 className="text-lg font-semibold text-slate-800 flex-1">XML Output</h3>
              <button
                onClick={handleCopyXml}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => setIsXmlModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-all">{xmlContent}</pre>
            </div>
          </div>
        </div>
      )}

    </header>
  );
};

// Toolbar Group
// Toolbar Group — flex-col so the label is structurally coupled to its icon row
const ToolbarGroup: React.FC<{ label: string; labelClassName?: string; children: React.ReactNode }> = ({ label, labelClassName, children }) => (
  <div className="flex flex-col">
    <div className="h-12 flex items-center gap-0.5">
      {children}
    </div>
    <div className={`h-5 flex items-center justify-center bg-slate-50 border-t border-slate-100 text-[10px] ${labelClassName ?? 'text-slate-400'}`}>
      <span>{label}</span>
    </div>
  </div>
);

// Toolbar Separator — two-row column matching ToolbarGroup height
const ToolbarSeparator: React.FC = () => (
  <div className="flex flex-col">
    <div className="h-12 flex items-center px-1">
      <div className="w-px h-6 bg-slate-200" />
    </div>
    <div className="h-5 bg-slate-50 border-t border-slate-100 px-1" />
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
  warning?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  active = false,
  danger = false,
  warning = false,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={label}
    className={`
      flex flex-col items-center justify-center px-2 py-1 rounded-lg transition-colors min-w-[50px]
      ${disabled
        ? 'opacity-30 cursor-not-allowed'
        : warning
          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
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
