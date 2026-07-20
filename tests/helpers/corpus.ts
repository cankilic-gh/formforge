import fs from 'fs';
import path from 'path';

// Real E-Bar form corpus. Override with EBAR_STATES_DIR when the repos live elsewhere.
const DEFAULT_STATES_DIR =
  '/Users/can/Documents/GitHub-ILGTechnologies/ILG-EBAS-E-Bar/states';

export const statesDir = (): string =>
  process.env.EBAR_STATES_DIR || DEFAULT_STATES_DIR;

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
