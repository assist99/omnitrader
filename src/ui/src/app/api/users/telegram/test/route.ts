import { NextRequest } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { queryOne } from '@/db/client';
import { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  try {
    const user = await queryOne<User>('SELECT telegram_chat_id FROM users WHERE id = ?', [auth.userId]);
    const chatId = user?.telegram_chat_id;

    if (!chatId) {
      return Response.json(
        { success: false, error: 'Telegram user ID not set. Please save your Telegram user ID first.' },
        { status: 400 }
      );
    }

    const engineUrl = process.env.ENGINE_URL || 'http://engine:3001';

    const engineRes = await fetch(`${engineUrl}/telegram/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: auth.userId, chatId }),
    });

    const data = await engineRes.json();

    if (engineRes.ok && data.success) {
      return Response.json({ success: true, message: 'Test message sent successfully' });
    }

    return Response.json(
      { success: false, error: data.error || 'Engine failed to send test message' },
      { status: engineRes.status }
    );
  } catch (err) {
    console.error('Test telegram error:', err);
    return Response.json(
      { success: false, error: 'Cannot connect to trading engine. Make sure the engine is running on port 3001.' },
      { status: 503 }
    );
  }
}