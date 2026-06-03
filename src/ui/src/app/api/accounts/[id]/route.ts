import { NextRequest } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { execute } from '@/db/client';
import { encrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  try {
    const { id } = await params;
    const accountId = parseInt(id);
    if (isNaN(accountId)) {
      return Response.json({ success: false, error: 'Invalid account ID' }, { status: 400 });
    }

    const body = await request.json();
    const { label, api_key, api_secret, is_testnet } = body;

    if (!label) {
      return Response.json(
        { success: false, error: 'Label is required' },
        { status: 400 }
      );
    }

    const updates: string[] = ['label = ?', 'is_testnet = ?'];
    const params_arr: any[] = [label, is_testnet ? 1 : 0];

    if (api_key) {
      updates.push('api_key_enc = ?');
      params_arr.push(encrypt(api_key));
    }
    if (api_secret) {
      updates.push('api_secret_enc = ?');
      params_arr.push(encrypt(api_secret));
    }

    params_arr.push(accountId, auth.userId);

    const result = await execute(
      `UPDATE bybit_accounts SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params_arr
    );

    if (result.changes === 0) {
      return Response.json(
        { success: false, error: 'Account not found or unauthorized' },
        { status: 404 }
      );
    }

    return Response.json({ success: true, message: 'Account updated' });
  } catch (err) {
    console.error('Update account error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  try {
    const { id } = await params;
    const accountId = parseInt(id);
    if (isNaN(accountId)) {
      return Response.json({ success: false, error: 'Invalid account ID' }, { status: 400 });
    }

    await execute('BEGIN TRANSACTION');

    await execute(
      `DELETE FROM orders WHERE setup_id IN (SELECT id FROM trading_setups WHERE account_id = ? AND user_id = ?)`,
      [accountId, auth.userId]
    );

    await execute(
      'DELETE FROM trading_setups WHERE account_id = ? AND user_id = ?',
      [accountId, auth.userId]
    );

    const result = await execute(
      'DELETE FROM bybit_accounts WHERE id = ? AND user_id = ?',
      [accountId, auth.userId]
    );

    if (result.changes === 0) {
      await execute('ROLLBACK');
      return Response.json(
        { success: false, error: 'Account not found or unauthorized' },
        { status: 404 }
      );
    }

    await execute('COMMIT');
    return Response.json({ success: true, message: 'Account and associated trades deleted' });
  } catch (err) {
    await execute('ROLLBACK').catch(() => {});
    console.error('Delete account error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}