'use client';

// Renders a unified diff (git-style +/-/@@ lines) with GitHub-like coloring.
// Used by the Test Lab (branch vs working-tree diff) and by AiFixModal
// (original form XML vs AI-proposed XML) so both surfaces look identical.

export const DiffView: React.FC<{ diff: string }> = ({ diff }) => {
  const lines = diff.replace(/\r/g, '').split('\n');
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white font-mono text-[11px] leading-relaxed">
      {lines.map((line, i) => {
        let cls = 'text-slate-600';
        if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
          cls = 'bg-slate-50 text-slate-400';
        } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
          cls = 'bg-slate-50 text-slate-500';
        } else if (line.startsWith('@@')) {
          cls = 'bg-indigo-50 text-indigo-700';
        } else if (line.startsWith('+')) {
          cls = 'bg-green-50 text-green-800';
        } else if (line.startsWith('-')) {
          cls = 'bg-red-50 text-red-800';
        } else if (line.startsWith('\\')) {
          cls = 'text-slate-400';
        }
        return (
          <div key={i} className={`whitespace-pre px-3 ${cls}`}>
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
};

export const countDiff = (diff: string) => {
  let add = 0, del = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+') && !l.startsWith('+++')) add++;
    else if (l.startsWith('-') && !l.startsWith('---')) del++;
  }
  return { add, del };
};
