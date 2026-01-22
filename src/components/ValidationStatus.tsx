'use client';

import { useMemo } from 'react';
import { useFormStore } from '@/stores/formStore';
import { FormNode } from '@/types/form';
import { AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';

interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  nodeIds?: string[];
}

// Collect all IDs from a node tree
const collectAllIds = (node: FormNode): { id: string; nodeType: string }[] => {
  const ids: { id: string; nodeType: string }[] = [{ id: node.id, nodeType: node.nodeType }];

  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      ids.push(...collectAllIds(child as FormNode));
    }
  }

  return ids;
};

// Validate form for duplicate IDs and other issues
const validateForm = (form: FormNode | null): ValidationError[] => {
  if (!form) return [];

  const errors: ValidationError[] = [];
  const allIds = collectAllIds(form);

  // Check for duplicate IDs
  const idCounts = new Map<string, { count: number; nodeTypes: string[] }>();
  for (const { id, nodeType } of allIds) {
    const existing = idCounts.get(id);
    if (existing) {
      existing.count++;
      existing.nodeTypes.push(nodeType);
    } else {
      idCounts.set(id, { count: 1, nodeTypes: [nodeType] });
    }
  }

  const duplicateIds: string[] = [];
  for (const [id, { count, nodeTypes }] of idCounts) {
    if (count > 1) {
      duplicateIds.push(id);
      errors.push({
        type: 'error',
        message: `Duplicate ID "${id}" found ${count} times (${nodeTypes.join(', ')})`,
        nodeIds: [id],
      });
    }
  }

  // Check for empty IDs
  const emptyIds = allIds.filter(({ id }) => !id || id.trim() === '');
  if (emptyIds.length > 0) {
    errors.push({
      type: 'error',
      message: `${emptyIds.length} node(s) have empty IDs`,
    });
  }

  // Check nextId is greater than all existing numeric IDs
  if ('nextId' in form && 'suffix' in form) {
    const questionnaire = form as FormNode & { nextId: number; suffix: string };
    const suffix = questionnaire.suffix;

    for (const { id } of allIds) {
      // Check if ID matches the pattern: number + suffix
      if (id.endsWith(suffix)) {
        const numPart = id.slice(0, -suffix.length);
        const num = parseInt(numPart, 10);
        if (!isNaN(num) && num >= questionnaire.nextId) {
          errors.push({
            type: 'warning',
            message: `ID "${id}" >= nextId (${questionnaire.nextId}). nextId should be higher.`,
            nodeIds: [id],
          });
        }
      }
    }
  }

  return errors;
};

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
