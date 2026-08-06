import { NextRequest, NextResponse } from 'next/server';
import { repoExists } from '@/lib/repoConfig';
import { formVersions } from '@/lib/gitRepo';

export const dynamic = 'force-dynamic';

// GET /api/repo/file?path=states/<st>/xml/forms/<f>.xml
// Returns the committed (HEAD) version, the working-tree version, and the git
// unified diff between them, so the Test Lab can show branch-vs-edited.
export async function GET(req: NextRequest) {
  if (!repoExists()) {
    return NextResponse.json({ ok: false, error: 'E-Bar repo not found.' }, { status: 200 });
  }
  const relPath = req.nextUrl.searchParams.get('path') || '';
  if (!relPath) {
    return NextResponse.json({ ok: false, error: 'missing path' }, { status: 400 });
  }
  const versions = await formVersions(relPath);
  if (!versions) {
    return NextResponse.json({ ok: false, error: 'illegal or non-form path' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...versions });
}
