import { NextRequest } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { queryOne } from '@/db/client';
import { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  const user = await queryOne<User>('SELECT id, email, telegram_chat_id, created_at FROM users WHERE id = ?', [auth.userId]);
  if (!user) return unauthorizedResponse();

  return Response.json({ success: true, data: user });
}