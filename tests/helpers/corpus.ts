import fs from 'fs';
import os from 'os';
import path from 'path';

// Real E-Bar form corpus. Optional: the vendored fixtures cover the always-run
// round-trip guarantee; this large corpus suite runs only when the E-Bar repo is
// present. Set EBAR_STATES_DIR to override; otherwise we probe common locations
// so it works on any machine regardless of the home-dir username.
const CANDIDATE_STATES_DIRS = [
  path.join(os.homedir(), 'Documents/GitHub-ILGTechnologies/ILG-EBAS-E-Bar/states'),
  path.join(os.homedir(), 'Documents/GitHub/ILG-EBAS-E-Bar/states'),
  // sibling of the formforge repo
  path.resolve(process.cwd(), '../GitHub-ILGTechnologies/ILG-EBAS-E-Bar/states'),
  path.resolve(process.cwd(), '../ILG-EBAS-E-Bar/states'),
];

export const statesDir = (): string => {
  if (process.env.EBAR_STATES_DIR) return process.env.EBAR_STATES_DIR;
  return CANDIDATE_STATES_DIRS.find(fs.existsSync) || CANDIDATE_STATES_DIRS[0];
};

export const corpusAvailable = (): boolean => fs.existsSync(statesDir());

export interface CorpusFile {
  state: string;
  kind: 'forms' | 'subforms';
  file: string;
  path: string;
}

export const listCorpusFiles = (): CorpusFile[] => {
  const root = statesDir();
  if (!fs.existsSync(root)) return [];
  const result: CorpusFile[] = [];
  for (const state of fs.readdirSync(root)) {
    for (const kind of ['forms', 'subforms'] as const) {
      const dir = path.join(root, state, 'xml', kind);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.xml')) continue;
        // suffix.xml is a <state_suffix> registry (form->suffix index), not a form;
        // the template states (ilg, ilgnow, ilgsurvey) keep a copy under forms/
        if (file === 'suffix.xml') continue;
        result.push({ state, kind, file, path: path.join(dir, file) });
      }
    }
  }
  return result;
};

export const readCorpusFile = (f: CorpusFile): string =>
  fs.readFileSync(f.path, 'utf-8');
