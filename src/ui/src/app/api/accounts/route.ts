import { NextRequest } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { execute, queryAll } from '@/db/client';
import { encrypt } from '@/lib/encryption';
import { BybitAccount } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  const accounts = await queryAll<BybitAccount>(
    'SELECT id, user_id, label, is_testnet, created_at FROM bybit_accounts WHERE user_id = ?',
    [auth.userId]
  );

  return Response.json({ success: true, data: accounts });
}

export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { label, api_key, api_secret, is_testnet } = body;

    if (!label || !api_key || !api_secret) {
      return Response.json(
        { success: false, error: 'Label, API key, and API secret are required' },
        { status: 400 }
      );
    }

    const apiKeyEnc = encrypt(api_key);
    const apiSecretEnc = encrypt(api_secret);

    const result = await execute(
      'INSERT INTO bybit_accounts (user_id, label, api_key_enc, api_secret_enc, is_testnet) VALUES (?, ?, ?, ?, ?)',
      [auth.userId, label, apiKeyEnc, apiSecretEnc, is_testnet ? 1 : 0]
    );

    const account = await queryAll<BybitAccount>(
      'SELECT id, user_id, label, is_testnet, created_at FROM bybit_accounts WHERE id = ?',
      [result.lastID]
    );

    return Response.json({ success: true, data: account[0] }, { status: 201 });
  } catch (err) {
    console.error('Create account error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}