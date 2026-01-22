'use client';

import { useState } from 'react';
import { useFormStore } from '@/stores/formStore';
import { Sidebar } from '@/components/Sidebar';
import { FormTree } from '@/components/FormTree';
import { PropertyPanel } from '@/components/PropertyPanel';
import { Toolbar } from '@/components/Toolbar';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { FormPreview } from '@/components/FormPreview';
import { SmartFormGenerator } from '@/components/SmartFormGenerator';

export default function Home() {
  const { form, isPreviewing } = useFormStore();
  const [showGenerator, setShowGenerator] = useState(false);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Toolbar onGenerateClick={() => setShowGenerator(true)} />
      <SmartFormGenerator isOpen={showGenerator} onClose={() => setShowGenerator(false)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex overflow-hidden">
          {form ? (
            isPreviewing ? (
              <div className="flex-1 overflow-hidden">
                <FormPreview />
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-auto p-4">
                  <FormTree />
                </div>

                <div className="w-[400px] border-l border-white/5 overflow-auto">
                  <PropertyPanel />
                </div>
              </>
            )
          ) : (
            <WelcomeScreen />
          )}
        </main>
      </div>
    </div>
  );
}
