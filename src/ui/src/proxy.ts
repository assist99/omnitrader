import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/dashboard')) {
    // UI authentication is handled by the engine API via Authorization header.
    // Do not enforce cookie-based auth here.
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}