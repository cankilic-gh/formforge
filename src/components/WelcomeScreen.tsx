'use client';

import { useFormStore } from '@/stores/formStore';
import { useModal } from '@/components/Modal';
import { parseXML, createEmptyForm } from '@/lib/xmlParser';
import { FileUp, Plus, Hammer, FileText, Layers, GitBranch, Calendar } from 'lucide-react';
import { useRef } from 'react';

export const WelcomeScreen: React.FC = () => {
  const { setForm } = useFormStore();
  const { showPrompt, showAlert } = useModal();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewForm = async () => {
    const title = await showPrompt('New Form', 'Enter form title:', 'Character and Fitness Questionnaire');
    if (title) {
      const suffix = await showPrompt('Form Suffix', 'Enter 5-digit suffix number for IDs:', '00001');
      if (suffix) {
        setForm(createEmptyForm(title, suffix));
      }
    }
  };

  const handleImport = () => {
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
        await showAlert('Error', 'Failed to parse XML file. Please check the format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
      <div className="max-w-2xl w-full">
        {/* Logo and title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-100 to-purple-100 border border-slate-200 mb-6 shadow-sm">
            <Hammer className="w-10 h-10 text-cyan-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-3">Welcome to FormForge</h1>
          <p className="text-slate-500 max-w-md mx-auto">
            Create and edit Bar Association application forms with a powerful visual editor. Import existing XML or start fresh.
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-4 mb-12">
          <button
            onClick={handleNewForm}
            className="bg-white p-6 rounded-xl border border-slate-200 hover:border-green-300 hover:shadow-md transition-all group text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center mb-4 group-hover:bg-green-100 transition-colors">
              <Plus className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">New Form</h3>
            <p className="text-sm text-slate-500">Start with a blank form and build from scratch</p>
          </button>

          <button
            onClick={handleImport}
            className="bg-white p-6 rounded-xl border border-slate-200 hover:border-cyan-300 hover:shadow-md transition-all group text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-cyan-50 flex items-center justify-center mb-4 group-hover:bg-cyan-100 transition-colors">
              <FileUp className="w-6 h-6 text-cyan-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">Import XML</h3>
            <p className="text-sm text-slate-500">Open and edit an existing form XML file</p>
          </button>
        </div>

        {/* Features overview */}
        <div className="border-t border-slate-200 pt-8">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 text-center">
            Features
          </h2>
          <div className="grid grid-cols-4 gap-4">
            <FeatureItem icon={FileText} label="20+ Question Types" />
            <FeatureItem icon={Layers} label="Repeatable Sections" />
            <FeatureItem icon={GitBranch} label="Condition Logic" />
            <FeatureItem icon={Calendar} label="Date Formats" />
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};

const FeatureItem: React.FC<{ icon: React.ElementType; label: string }> = ({ icon: Icon, label }) => (
  <div className="text-center">
    <Icon className="w-5 h-5 text-slate-400 mx-auto mb-2" />
    <span className="text-xs text-slate-500">{label}</span>
  </div>
);
