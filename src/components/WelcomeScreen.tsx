'use client';

import { useFormStore } from '@/stores/formStore';
import { parseXML, createEmptyForm } from '@/lib/xmlParser';
import { FileUp, Plus, Hammer, FileText, Layers, GitBranch, Calendar } from 'lucide-react';
import { useRef } from 'react';

export const WelcomeScreen: React.FC = () => {
  const { setForm } = useFormStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewForm = () => {
    const title = prompt('Form title:', 'Character & Fitness Questionnaire');
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
        alert('Failed to parse XML file. Please check the format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Logo and title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-forge-cyan/20 to-forge-purple/20 border border-white/10 mb-6">
            <Hammer className="w-10 h-10 text-forge-cyan" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Welcome to FormForge</h1>
          <p className="text-gray-400 max-w-md mx-auto">
            Create and edit Bar Association application forms with a powerful visual editor. Import existing XML or start fresh.
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-4 mb-12">
          <button
            onClick={handleNewForm}
            className="glass-panel p-6 rounded-xl hover:bg-white/5 transition-colors group text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-forge-green/20 flex items-center justify-center mb-4 group-hover:bg-forge-green/30 transition-colors">
              <Plus className="w-6 h-6 text-forge-green" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">New Form</h3>
            <p className="text-sm text-gray-500">Start with a blank form and build from scratch</p>
          </button>

          <button
            onClick={handleImport}
            className="glass-panel p-6 rounded-xl hover:bg-white/5 transition-colors group text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-forge-cyan/20 flex items-center justify-center mb-4 group-hover:bg-forge-cyan/30 transition-colors">
              <FileUp className="w-6 h-6 text-forge-cyan" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Import XML</h3>
            <p className="text-sm text-gray-500">Open and edit an existing form XML file</p>
          </button>
        </div>

        {/* Features overview */}
        <div className="border-t border-white/5 pt-8">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-4 text-center">
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
    <Icon className="w-5 h-5 text-gray-500 mx-auto mb-2" />
    <span className="text-xs text-gray-500">{label}</span>
  </div>
);
