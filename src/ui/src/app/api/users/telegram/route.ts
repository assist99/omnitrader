import { NextRequest } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { execute } from '@/db/client';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { telegram_chat_id } = body;

    await execute(
      'UPDATE users SET telegram_chat_id = ? WHERE id = ?',
      [telegram_chat_id || null, auth.userId]
    );

    return Response.json({ success: true, message: 'Telegram user ID updated' });
  } catch (err) {
    console.error('Update telegram error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}