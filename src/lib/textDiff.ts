// textDiff.ts  (server-only)
//
// Produces a real git-style unified diff between two arbitrary strings that
// are NOT necessarily committed anywhere (e.g. "original form XML" vs
// "AI-proposed form XML" — both just live in memory). Reuses the same
// execFile('git', ...) pattern as gitRepo.ts, but against `git diff --no-index`
// on two temp files instead of a real repo path, so we get git's proven diff
// algorithm and hunk formatting without hand-rolling one.

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const exec = promisify(execFile);

// git diff --no-index exits 1 when the files differ (that's not a failure for
// us — the diff is on stdout either way) and 0 when they're identical.
export const gitStyleDiff = async (
  oldText: string,
  newText: string,
  labels: { old?: string; new?: string } = {}
): Promise<string> => {
  if (oldText === newText) return '';

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'formforge-diff-'));
  const oldPath = path.join(dir, labels.old || 'original.xml');
  const newPath = path.join(dir, labels.new || 'proposed.xml');
  try {
    await Promise.all([fs.writeFile(oldPath, oldText, 'utf-8'), fs.writeFile(newPath, newText, 'utf-8')]);
    try {
      const { stdout } = await exec('git', ['diff', '--no-index', '--no-color', oldPath, newPath], {
        maxBuffer: 20 * 1024 * 1024,
      });
      return stdout;
    } catch (e) {
      // --no-index exits 1 when the files differ; the patch is still on stdout
      return (e as { stdout?: string })?.stdout || '';
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};
