'use client';

import { useFormStore } from '@/stores/formStore';
import { parseXML, buildXML, createEmptyForm } from '@/lib/xmlParser';
import {
  Hammer,
  FileUp,
  FileDown,
  Plus,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useRef } from 'react';

export const Toolbar: React.FC = () => {
  const {
    form,
    setForm,
    isPreviewing,
    togglePreview,
    undo,
    redo,
    history,
    historyIndex,
    expandAll,
    collapseAll,
  } = useFormStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewForm = () => {
    const title = prompt('Form title:', 'New Character & Fitness Questionnaire');
    if (title) {
      setForm(createEmptyForm(title));
    }
  };

  const handleImport = () => {
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

    // Reset input
    e.target.value = '';
  };

  const handleExport = () => {
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

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <header className="h-14 border-b border-white/5 flex items-center px-4 gap-4 bg-black/20">
      {/* Logo */}
      <div className="flex items-center gap-2 pr-4 border-r border-white/10">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-forge-cyan/30 to-forge-purple/30 flex items-center justify-center">
          <Hammer className="w-4 h-4 text-forge-cyan" />
        </div>
        <span className="font-bold text-white tracking-wide">FormForge</span>
      </div>

      {/* File actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleNewForm}
          className="btn btn-ghost"
          title="New Form"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New</span>
        </button>

        <button
          onClick={handleImport}
          className="btn btn-ghost"
          title="Import XML"
        >
          <FileUp className="w-4 h-4" />
          <span className="hidden sm:inline">Import</span>
        </button>

        <button
          onClick={handleExport}
          className="btn btn-ghost"
          disabled={!form}
          title="Export XML"
        >
          <FileDown className="w-4 h-4" />
          <span className="hidden sm:inline">Export</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* History */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="btn btn-ghost"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className="btn btn-ghost"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* View controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={expandAll}
          disabled={!form}
          className="btn btn-ghost"
          title="Expand All"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        <button
          onClick={collapseAll}
          disabled={!form}
          className="btn btn-ghost"
          title="Collapse All"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Form title */}
      {form && (
        <div className="text-sm text-gray-400 truncate max-w-md">
          {form.title}
        </div>
      )}

      {/* Preview toggle */}
      <button
        onClick={togglePreview}
        disabled={!form}
        className={`btn ${isPreviewing ? 'btn-primary' : 'btn-ghost'}`}
        title="Toggle Preview"
      >
        {isPreviewing ? (
          <>
            <EyeOff className="w-4 h-4" />
            <span>Edit</span>
          </>
        ) : (
          <>
            <Eye className="w-4 h-4" />
            <span>Preview</span>
          </>
        )}
      </button>
    </header>
  );
};
