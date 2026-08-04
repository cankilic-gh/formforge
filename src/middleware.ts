import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/authToken';

// Server-side gate for every page. Fail-closed: no AUTH_SECRET means no access
// (except in local dev, where missing env vars just disable the gate).

export async function middleware(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'development') return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token, secret))) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // protect all pages; leave /login, the login API, and static assets open
  matcher: ['/((?!login|api/login|_next|favicon\\.ico|.*\\..*).*)'],
};
