'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useFormStore } from '@/stores/formStore';
import { parseAnyXML, buildAnyXML } from '@/lib/xmlParser';
import { diffXML, Diff } from '@/lib/canonicalDiff';
import { validateForm, walkNodes, ValidationError } from '@/lib/validation';
import { FormPreview } from '@/components/FormPreview';
import { DiffView, countDiff } from '@/components/DiffView';
import { FormNode, FormRoot, FormUnknown } from '@/types/form';
import {
  Upload, CheckCircle2, XCircle, AlertTriangle, Eye, FileCode2, ArrowLeft,
  GitBranch, RefreshCw,
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

// ─── git types ───────────────────────────────────────────────
interface ChangedForm { path: string; status: string; }
interface RepoInfo { ok: boolean; branch?: string; files?: ChangedForm[]; error?: string; }
interface FormVersions {
  ok: boolean; path: string; branch: string;
  committed: string | null; working: string | null;
  unifiedDiff: string; isNew: boolean; error?: string;
}
interface GitComparison {
  versions: FormVersions;
  test: TestResult | null;       // round-trip + validation on the WORKING (edited) version
  committedTest: TestResult | null; // parsed committed version (for preview)
}

const basename = (p: string) => p.split('/').pop() || p;
const stateOf = (p: string) => (p.match(/states\/([^/]+)\//)?.[1] || '').toUpperCase();

const IssueList: React.FC<{ issues: ValidationError[] }> = ({ issues }) => (
  <div className="max-h-56 space-y-1 overflow-auto">
    {issues.map((v, i) => (
      <div key={i} className={`text-xs leading-relaxed ${v.type === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
        {v.type === 'error' ? '● ' : '▲ '}{v.message}
      </div>
    ))}
  </div>
);

export default function TestLab() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [selected, setSelected] = useState<TestResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLabel, setPreviewLabel] = useState('');
  const setForm = useFormStore((s) => s.setForm);

  // git state
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [repoLoading, setRepoLoading] = useState(true);
  const [gitSelPath, setGitSelPath] = useState<string | null>(null);
  const [gitCmp, setGitCmp] = useState<GitComparison | null>(null);
  const [gitLoading, setGitLoading] = useState(false);

  const loadRepo = useCallback(async () => {
    setRepoLoading(true);
    try {
      const res = await fetch('/api/repo/changed');
      const data: RepoInfo = await res.json();
      setRepo(data);
      // auto-select the first changed form so nothing needs uploading
      if (data.ok && data.files && data.files.length > 0) {
        setGitSelPath((prev) => prev ?? data.files![0].path);
      }
    } catch (e) {
      setRepo({ ok: false, error: (e as Error).message });
    } finally {
      setRepoLoading(false);
    }
  }, []);

  useEffect(() => { loadRepo(); }, [loadRepo]);

  // fetch versions whenever the selected repo form changes
  useEffect(() => {
    if (!gitSelPath) { setGitCmp(null); return; }
    let cancelled = false;
    setGitLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/repo/file?path=${encodeURIComponent(gitSelPath)}`);
        const v: FormVersions = await res.json();
        if (cancelled) return;
        const test = v.working ? runTest(basename(v.path), v.working) : null;
        const committedTest = v.committed ? runTest(basename(v.path), v.committed) : null;
        setGitCmp({ versions: v, test, committedTest });
      } catch (e) {
        if (!cancelled) setGitCmp({ versions: { ok: false, path: gitSelPath, branch: '', committed: null, working: null, unifiedDiff: '', isNew: false, error: (e as Error).message }, test: null, committedTest: null });
      } finally {
        if (!cancelled) setGitLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gitSelPath]);

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

  const preview = (form: FormRoot | null, label: string) => {
    if (!form) return;
    const current = useFormStore.getState().form;
    if (current && !window.confirm(`Previewing "${label}" replaces the form currently open in the editor ("${current.title}"). Continue?`)) return;
    setForm(JSON.parse(JSON.stringify(form)));
    setPreviewLabel(label);
    setShowPreview(true);
  };

  const statusOf = (r: TestResult): 'pass' | 'fail' | 'warn' => {
    if (!r.form || r.diffs.length > 0 || r.validation.some((v) => v.type === 'error')) return 'fail';
    if (r.validation.length > 0 || r.preserved.length > 0) return 'warn';
    return 'pass';
  };

  if (showPreview) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <button onClick={() => setShowPreview(false)} className="flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4" /> Test Lab
          </button>
          <span className="text-sm font-medium text-slate-800">{previewLabel}</span>
          <span className="text-xs text-slate-400">E-Bar render preview</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <FormPreview />
        </div>
      </div>
    );
  }

  const errorCount = (r: TestResult | null) => r?.validation.filter((v) => v.type === 'error').length ?? 0;
  const warnCount = (r: TestResult | null) => r?.validation.filter((v) => v.type === 'warning').length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Form Test Lab</h1>
            <p className="mt-1 text-sm text-slate-500">
              Compare a form&apos;s committed (branch) version against your working-tree edits, and verify how it renders.
            </p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">Back to editor</Link>
        </div>

        {/* ── Git: changed forms in the repo ───────────────────── */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <GitBranch className="h-4 w-4 text-slate-400" />
              {repo?.ok && repo.branch ? (
                <>Changed forms on <span className="font-mono text-slate-900">{repo.branch}</span></>
              ) : 'Repository changes'}
            </div>
            <button onClick={loadRepo} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
              <RefreshCw className={`h-3.5 w-3.5 ${repoLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {repoLoading && <div className="px-4 py-3 text-sm text-slate-400">Loading repository…</div>}

          {!repoLoading && repo && !repo.ok && (
            <div className="px-4 py-3 text-sm text-amber-600">{repo.error || 'Repository not available.'}</div>
          )}

          {!repoLoading && repo?.ok && (repo.files?.length ?? 0) === 0 && (
            <div className="px-4 py-3 text-sm text-slate-400">No changed forms in the working tree. Everything matches the branch.</div>
          )}

          {!repoLoading && repo?.ok && (repo.files?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-3">
              {repo.files!.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setGitSelPath(f.path)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                    gitSelPath === f.path ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                  }`}
                >
                  <span className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500">{f.status}</span>
                  <span className="font-mono">{stateOf(f.path)}</span>
                  <span>{basename(f.path)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Selected repo form: branch vs working ────────────── */}
        {gitSelPath && (
          <div className="mb-8">
            {gitLoading && <div className="text-sm text-slate-400">Loading diff…</div>}

            {!gitLoading && gitCmp && gitCmp.versions.ok && (
              <div className="space-y-4">
                {/* summary bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-slate-800">{basename(gitCmp.versions.path)}</span>
                  {(() => { const c = countDiff(gitCmp.versions.unifiedDiff); return (
                    <span className="text-xs text-slate-500">
                      <span className="text-green-600">+{c.add}</span> <span className="text-red-600">-{c.del}</span> vs <span className="font-mono">{gitCmp.versions.branch}</span>
                      {gitCmp.versions.isNew && <span className="ml-2 rounded bg-green-100 px-1 text-green-700">new file</span>}
                    </span>
                  ); })()}
                  <div className="ml-auto flex items-center gap-2">
                    {gitCmp.committedTest?.form && (
                      <button onClick={() => preview(gitCmp.committedTest!.form, `${basename(gitCmp.versions.path)} — branch (${gitCmp.versions.branch})`)}
                        className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">
                        <Eye className="h-3.5 w-3.5" /> Preview branch
                      </button>
                    )}
                    {gitCmp.test?.form && (
                      <button onClick={() => preview(gitCmp.test!.form, `${basename(gitCmp.versions.path)} — your edits`)}
                        className="flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200">
                        <Eye className="h-3.5 w-3.5" /> Preview edited
                      </button>
                    )}
                  </div>
                </div>

                {/* validation of the edited (working) version */}
                {gitCmp.test && (errorCount(gitCmp.test) + warnCount(gitCmp.test) > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-slate-700">
                      Validation of your edits{' '}
                      {errorCount(gitCmp.test) > 0 && <span className="text-red-600">· {errorCount(gitCmp.test)} error(s)</span>}
                      {warnCount(gitCmp.test) > 0 && <span className="text-amber-600"> · {warnCount(gitCmp.test)} warning(s)</span>}
                    </h3>
                    <IssueList issues={gitCmp.test.validation} />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4" /> Your edits pass validation.
                  </div>
                ))}

                {/* the git diff */}
                {gitCmp.versions.unifiedDiff.trim() ? (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-700">Diff — branch vs your edits</h3>
                    <DiffView diff={gitCmp.versions.unifiedDiff} />
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">No differences from the branch version.</div>
                )}
              </div>
            )}

            {!gitLoading && gitCmp && !gitCmp.versions.ok && (
              <div className="text-sm text-amber-600">{gitCmp.versions.error || 'Could not load this form.'}</div>
            )}
          </div>
        )}

        {/* ── Secondary: test an arbitrary uploaded file ───────── */}
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-600">
            Or test an arbitrary XML file (upload)
          </summary>
          <div className="border-t border-slate-100 p-4">
            <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white px-6 py-8 text-center hover:border-blue-400 hover:bg-blue-50/30">
              <Upload className="mb-2 h-6 w-6 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Drop E-Bar form XML files here or click to choose</span>
              <input type="file" accept=".xml" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </label>

            {results.length > 0 && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  {results.map((r, i) => {
                    const status = statusOf(r);
                    return (
                      <button key={`${r.fileName}-${i}`} onClick={() => setSelected(r)}
                        className={`flex w-full items-center gap-3 rounded-lg border bg-white px-4 py-3 text-left shadow-sm hover:border-blue-300 ${selected === r ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'}`}>
                        {status === 'pass' && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />}
                        {status === 'warn' && <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />}
                        {status === 'fail' && <XCircle className="h-5 w-5 shrink-0 text-red-600" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-800">{r.fileName}</div>
                          <div className="text-xs text-slate-500">
                            {!r.form ? 'Parse failed' : `${r.diffs.length} round-trip diff(s) · ${r.validation.length} validation issue(s)`}
                          </div>
                        </div>
                        {r.form && (
                          <span onClick={(e) => { e.stopPropagation(); preview(r.form, r.fileName); }}
                            className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-blue-100 hover:text-blue-700">
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
                        <CheckCircle2 className="h-4 w-4" /> Round-trip verified: identical after parse + rebuild.
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
                        <IssueList issues={selected.validation} />
                      </div>
                    )}
                    {selected.form && (
                      <details className="rounded-lg border border-slate-200 bg-white p-4">
                        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                          <FileCode2 className="h-4 w-4" /> Rebuilt XML
                        </summary>
                        <pre className="mt-3 max-h-80 overflow-auto rounded bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{selected.rebuilt}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
