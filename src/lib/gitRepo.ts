// gitRepo.ts  (server-only)
//
// Thin wrapper around the git CLI, scoped to the E-Bar repo. Uses execFile (no
// shell) so nothing is interpolated into a shell string. Paths are validated by
// repoConfig before they ever reach here.

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { getRepoRoot, resolveRepoPath, isAllowedFormPath } from './repoConfig';

const exec = promisify(execFile);

const git = async (args: string[]): Promise<string> => {
  const { stdout } = await exec('git', ['-C', getRepoRoot(), ...args], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
};

export const currentBranch = async (): Promise<string> => {
  try {
    return (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  } catch {
    return '(unknown)';
  }
};

export interface ChangedForm {
  path: string; // repo-relative
  status: string; // e.g. "M", "A", "??"
}

// Every changed/untracked form or subform in the working tree.
export const changedForms = async (): Promise<ChangedForm[]> => {
  let out = '';
  try {
    out = await git(['status', '--porcelain', '--', 'states']);
  } catch {
    return [];
  }
  const forms: ChangedForm[] = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim();
    let file = line.slice(3).trim();
    // renames come as "old -> new"; take the new path
    const arrow = file.indexOf(' -> ');
    if (arrow !== -1) file = file.slice(arrow + 4);
    file = file.replace(/^"(.*)"$/, '$1'); // git quotes paths with odd chars
    if (isAllowedFormPath(file)) forms.push({ path: file, status: status || '?' });
  }
  forms.sort((a, b) => a.path.localeCompare(b.path));
  return forms;
};

export interface FormVersions {
  path: string;
  branch: string;
  committed: string | null; // HEAD version, null if the file is new (untracked/added)
  working: string | null; // working-tree version, null if deleted
  unifiedDiff: string; // git diff vs HEAD (empty if identical)
  isNew: boolean;
}

export const formVersions = async (relPath: string): Promise<FormVersions | null> => {
  const abs = resolveRepoPath(relPath);
  if (!abs) return null;

  const branch = await currentBranch();

  let committed: string | null = null;
  try {
    committed = await git(['show', `HEAD:${relPath}`]);
  } catch {
    committed = null; // not present at HEAD => new file
  }

  let working: string | null = null;
  try {
    working = await fs.readFile(abs, 'utf-8');
  } catch {
    working = null; // deleted in working tree
  }

  let unifiedDiff = '';
  try {
    // For untracked files git diff shows nothing unless we intent-to-add; use
    // --no-index against /dev/null so a brand-new file still renders as all-added.
    if (committed === null && working !== null) {
      unifiedDiff = await git(['diff', '--no-index', '--', '/dev/null', abs]).catch((e) => {
        // --no-index exits 1 when files differ; the patch is still on stdout
        return (e?.stdout as string) || '';
      });
    } else {
      unifiedDiff = await git(['diff', 'HEAD', '--', relPath]);
    }
  } catch (e) {
    unifiedDiff = (e as { stdout?: string })?.stdout || '';
  }

  return {
    path: relPath,
    branch,
    committed,
    working,
    unifiedDiff,
    isNew: committed === null,
  };
};
