import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from '@/lib/authToken';

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  const user = process.env.AUTH_USER;
  const pass = process.env.AUTH_PASS;
  const secret = process.env.AUTH_SECRET;

  if (!user || !pass || !secret) {
    return NextResponse.json({ error: 'Auth is not configured on the server' }, { status: 500 });
  }
  if (username !== user || password !== pass) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
