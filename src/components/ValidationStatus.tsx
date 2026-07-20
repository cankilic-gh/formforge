'use client';

import { useMemo } from 'react';
import { useFormStore } from '@/stores/formStore';
import { validateForm } from '@/lib/validation';
import { AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';

export const ValidationStatus: React.FC = () => {
  const { form } = useFormStore();

  const errors = useMemo(() => validateForm(form), [form]);

  const errorCount = errors.filter((e) => e.type === 'error').length;
  const warningCount = errors.filter((e) => e.type === 'warning').length;

  if (!form) return null;

  return (
    <div className="border-b border-slate-200 bg-slate-50">
      {errors.length === 0 ? (
        <div className="px-4 py-2 flex items-center gap-2 text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-xs font-medium">Form is valid - No issues found</span>
        </div>
      ) : (
        <div className="px-4 py-2">
          <div className="flex items-center gap-3 mb-2">
            {errorCount > 0 && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs font-medium">{errorCount} error(s)</span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium">{warningCount} warning(s)</span>
              </div>
            )}
          </div>
          <div className="space-y-1 max-h-24 overflow-auto">
            {errors.map((error, index) => (
              <div
                key={index}
                className={`text-[11px] ${
                  error.type === 'error' ? 'text-red-600' : 'text-amber-600'
                }`}
              >
                {error.type === 'error' ? '● ' : '▲ '}
                {error.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
