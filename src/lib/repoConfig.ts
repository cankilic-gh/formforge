// repoConfig.ts  (server-only)
//
// Locates the ILG-EBAS-E-Bar git checkout on disk so the Test Lab can compare
// the committed (branch) version of a form against the working-tree version.
//
// The repo root is resolved from EBAR_REPO_PATH, falling back to the standard
// local checkout location. Everything here is server-side only (fs/path); do
// not import it into client components.

import path from 'path';
import fs from 'fs';

const DEFAULT_REPO = '/Users/can/Documents/GitHub-ILGTechnologies/ILG-EBAS-E-Bar';

export const getRepoRoot = (): string => {
  const root = process.env.EBAR_REPO_PATH?.trim() || DEFAULT_REPO;
  return path.resolve(root);
};

export const repoExists = (): boolean => {
  try {
    return fs.existsSync(path.join(getRepoRoot(), '.git'));
  } catch {
    return false;
  }
};

// Only form/subform XML under states/<st>/xml/{forms,subforms}/ is allowed.
const FORM_PATH_RE = /^states\/[^/]+\/xml\/(forms|subforms)\/[^/]+\.xml$/;

export const isAllowedFormPath = (relPath: string): boolean => FORM_PATH_RE.test(relPath);

// Resolve a repo-relative path safely: must stay inside the repo and match the
// allowed form-path shape. Returns the absolute path, or null if illegal.
export const resolveRepoPath = (relPath: string): string | null => {
  const clean = relPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  if (!isAllowedFormPath(clean)) return null;
  const root = getRepoRoot();
  const abs = path.resolve(root, clean);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!abs.startsWith(rootWithSep)) return null; // path traversal guard
  return abs;
};
