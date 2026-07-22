'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useFormStore } from '@/stores/formStore';
import { parseAnyXML, buildAnyXML } from '@/lib/xmlParser';
import { diffXML, Diff } from '@/lib/canonicalDiff';
import { validateForm, walkNodes, ValidationError } from '@/lib/validation';
import { FormPreview } from '@/components/FormPreview';
import { FormNode, FormRoot, FormUnknown } from '@/types/form';
import {
  Upload, CheckCircle2, XCircle, AlertTriangle, Eye, FileCode2, ArrowLeft,
} from 'lucide-react';

interface TestResult {
  fileName: string;
  xml: string;
  form: FormRoot | null;
  diffs: Diff[];
  validation: ValidationError[];
  preserved: { tagName: string; id: string }[];
  rebuilt: string;
}

const runTest = (fileName: string, xml: string): TestResult => {
  const form = parseAnyXML(xml);
  if (!form) {
    return { fileName, xml, form: null, diffs: [], validation: [], preserved: [], rebuilt: '' };
  }
  const rebuilt = buildAnyXML(form);
  const diffs = diffXML(xml, rebuilt);
  const validation = validateForm(form);
  const preserved: { tagName: string; id: string }[] = [];
  walkNodes(form as FormNode, (n) => {
    if (n.nodeType === 'unknown') {
      const u = n as FormUnknown;
      preserved.push({ tagName: u.tagName, id: u.id });
    }
  });
  return { fileName, xml, form, diffs, validation, preserved, rebuilt };
};

export default function TestLab() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [selected, setSelected] = useState<TestResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const setForm = useFormStore((s) => s.setForm);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const next: TestResult[] = [];
    for (const file of Array.from(fileList)) {
      const text = await file.text();
      next.push(runTest(file.name, text));
    }
    setResults((prev) => [...next, ...prev]);
    if (next.length === 1) setSelected(next[0]);
  }, []);

  const openPreview = (r: TestResult) => {
    if (!r.form) return;
    const current = useFormStore.getState().form;
    if (
      current &&
      !window.confirm(
        `Previewing "${r.fileName}" replaces the form currently open in the editor ("${current.title}"). Continue?`
      )
    ) {
      return;
    }
    setForm(JSON.parse(JSON.stringify(r.form)));
    setSelected(r);
    setShowPreview(true);
  };

  const statusOf = (r: TestResult): 'pass' | 'fail' | 'warn' => {
    if (!r.form || r.diffs.length > 0 || r.validation.some((v) => v.type === 'error')) return 'fail';
    if (r.validation.length > 0 || r.preserved.length > 0) return 'warn';
    return 'pass';
  };

  if (showPreview && selected?.form) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <button
            onClick={() => setShowPreview(false)}
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" /> Test Lab
          </button>
          <span className="text-sm font-medium text-slate-800">{selected.fileName}</span>
          <span className="text-xs text-slate-400">E-Bar render preview</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <FormPreview />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Form Test Lab</h1>
            <p className="mt-1 text-sm text-slate-500">
              Verify that FormForge round-trips a real E-Bar form with zero semantic loss,
              then inspect how it renders.
            </p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">Back to editor</Link>
        </div>

        <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center hover:border-blue-400 hover:bg-blue-50/30">
          <Upload className="mb-2 h-6 w-6 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Drop E-Bar form XML files here or click to choose</span>
          <span className="mt-1 text-xs text-slate-400">
            e.g. ILG-EBAS-E-Bar/states/&lt;state&gt;/xml/forms/*.xml
          </span>
          <input
            type="file"
            accept=".xml"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>

        {results.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              {results.map((r, i) => {
                const status = statusOf(r);
                return (
                  <button
                    key={`${r.fileName}-${i}`}
                    onClick={() => setSelected(r)}
                    className={`flex w-full items-center gap-3 rounded-lg border bg-white px-4 py-3 text-left shadow-sm hover:border-blue-300 ${
                      selected === r ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'
                    }`}
                  >
                    {status === 'pass' && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />}
                    {status === 'warn' && <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />}
                    {status === 'fail' && <XCircle className="h-5 w-5 shrink-0 text-red-600" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{r.fileName}</div>
                      <div className="text-xs text-slate-500">
                        {!r.form
                          ? 'Parse failed - not a questionnaire/subform'
                          : `${r.diffs.length} round-trip diff(s) · ${r.validation.length} validation issue(s) · ${r.preserved.length} preserved element(s)`}
                      </div>
                    </div>
                    {r.form && (
                      <span
                        onClick={(e) => { e.stopPropagation(); openPreview(r); }}
                        className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-blue-100 hover:text-blue-700"
                      >
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="space-y-4">
                {selected.form && selected.diffs.length === 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Round-trip verified: the E-Bar engine sees an identical form after FormForge parse + rebuild.
                  </div>
                )}

                {selected.diffs.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-red-700">Round-trip differences ({selected.diffs.length})</h3>
                    <div className="max-h-64 space-y-1 overflow-auto">
                      {selected.diffs.slice(0, 50).map((d, i) => (
                        <div key={i} className="text-xs text-slate-600">
                          <span className="rounded bg-red-100 px-1 text-red-700">{d.kind}</span>{' '}
                          <span className="font-mono">{d.path}</span>: {d.detail}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.validation.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-amber-700">Validation ({selected.validation.length})</h3>
                    <div className="max-h-48 space-y-1 overflow-auto">
                      {selected.validation.map((v, i) => (
                        <div key={i} className={`text-xs ${v.type === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                          {v.type === 'error' ? '● ' : '▲ '}{v.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.preserved.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-slate-700">
                      Preserved verbatim (not modeled yet)
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {selected.preserved.map((p, i) => (
                        <span key={i} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                          &lt;{p.tagName}&gt; #{p.id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.form && (
                  <details className="rounded-lg border border-slate-200 bg-white p-4">
                    <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                      <FileCode2 className="h-4 w-4" /> Rebuilt XML
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto rounded bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                      {selected.rebuilt}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
