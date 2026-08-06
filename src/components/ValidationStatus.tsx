'use client';

import { useMemo, useState } from 'react';
import { useFormStore } from '@/stores/formStore';
import { validateForm, ValidationError } from '@/lib/validation';
import { AlertTriangle, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';

const IssueRow: React.FC<{ issue: ValidationError; onJump: (id: string) => void }> = ({ issue, onJump }) => {
  const isError = issue.type === 'error';
  const nodeId = issue.nodeIds?.[0];
  const clickable = Boolean(nodeId);
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => nodeId && onJump(nodeId)}
      title={clickable ? 'Jump to this node' : undefined}
      className={`group flex w-full items-start gap-2 border-b border-slate-100 px-4 py-2 text-left last:border-b-0 ${
        clickable ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'
      }`}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      )}
      <span className={`text-xs leading-relaxed ${isError ? 'text-red-700' : 'text-amber-700'}`}>
        {issue.message}
        {clickable && (
          <span className="ml-1 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100">
            #{nodeId}
          </span>
        )}
      </span>
    </button>
  );
};

export const ValidationStatus: React.FC = () => {
  const { form, revealNode } = useFormStore();
  const [collapsed, setCollapsed] = useState(false);

  const issues = useMemo(() => validateForm(form), [form]);
  const errors = issues.filter((e) => e.type === 'error');
  const warnings = issues.filter((e) => e.type === 'warning');

  if (!form) return null;

  const clean = issues.length === 0;

  if (clean) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-green-600">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-xs font-medium">Form is valid - no issues found</span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col border-b border-slate-200 bg-white">
      {/* Header (click to collapse/expand) */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex shrink-0 items-center justify-between gap-3 bg-slate-50 px-4 py-2 hover:bg-slate-100"
      >
        <div className="flex items-center gap-3">
          {errors.length > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-semibold">{errors.length} error{errors.length > 1 ? 's' : ''}</span>
            </span>
          )}
          {warnings.length > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-semibold">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="max-h-[50vh] min-h-0 overflow-auto">
          {errors.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 bg-red-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-600">
                Errors - the engine will crash or hide these
              </div>
              {errors.map((issue, i) => (
                <IssueRow key={`e${i}`} issue={issue} onJump={revealNode} />
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 bg-amber-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                Warnings - renders, but probably not as intended
              </div>
              {warnings.map((issue, i) => (
                <IssueRow key={`w${i}`} issue={issue} onJump={revealNode} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
