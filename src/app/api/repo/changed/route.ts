import { NextResponse } from 'next/server';
import { repoExists } from '@/lib/repoConfig';
import { currentBranch, changedForms } from '@/lib/gitRepo';

export const dynamic = 'force-dynamic';

// GET /api/repo/changed
// Lists every changed/untracked form+subform in the E-Bar working tree, plus the
// current branch. Used by the Test Lab to offer forms without a manual upload.
export async function GET() {
  if (!repoExists()) {
    return NextResponse.json(
      { ok: false, error: 'E-Bar repo not found. Set EBAR_REPO_PATH to the ILG-EBAS-E-Bar checkout.' },
      { status: 200 }
    );
  }
  try {
    const [branch, files] = await Promise.all([currentBranch(), changedForms()]);
    return NextResponse.json({ ok: true, branch, files });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
