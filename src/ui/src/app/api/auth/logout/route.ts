import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  const response = Response.json({ success: true, message: 'Logged out' });
  response.headers.set(
    'Set-Cookie',
    'token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
  );
  return response;
}