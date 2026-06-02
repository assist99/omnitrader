import { NextRequest } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { execute, queryAll, queryOne } from '@/db/client';
import { setupSchema } from '@/lib/validation';
import { TradingSetup, Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = getAuthFromRequest(_request);
    if (!auth) return unauthorizedResponse();

    const setup = await queryOne<TradingSetup>(
      'SELECT ts.*, ba.label as account_label FROM trading_setups ts LEFT JOIN bybit_accounts ba ON ts.account_id = ba.id WHERE ts.id = ? AND ts.user_id = ?',
      [id, auth.userId]
    );

    if (!setup) {
      return Response.json({ success: false, error: 'Setup not found' }, { status: 404 });
    }

    const orders = await queryAll<Order>(
      'SELECT * FROM orders WHERE setup_id = ? ORDER BY created_at ASC',
      [id]
    );

    return Response.json({ success: true, data: { ...setup, orders } });
  } catch (err) {
    console.error('GET setup error:', err);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = getAuthFromRequest(request);
    if (!auth) return unauthorizedResponse();

    const existing = await queryOne<TradingSetup>(
      'SELECT * FROM trading_setups WHERE id = ? AND user_id = ?',
      [id, auth.userId]
    );
    if (!existing) {
      return Response.json({ success: false, error: 'Setup not found' }, { status: 404 });
    }

    const body = await request.json();

    if (existing.status === 'active') {
      const beTriggerPrice = body.be_trigger_price !== undefined ? parseFloat(body.be_trigger_price) : undefined;
      const exitIndicatorType = body.exit_indicator_type || null;
      const exitIndicatorTf = body.exit_indicator_tf || null;

      const updates: string[] = ['updated_at = datetime(\'now\')'];
      const params: any[] = [];

      if (beTriggerPrice !== undefined) {
        updates.push('be_enabled = ?, be_trigger_price = ?');
        params.push(body.be_enabled ? 1 : 0, beTriggerPrice);
      }

      if (body.exit_indicator_type !== undefined) {
        updates.push('exit_indicator_type = ?, exit_indicator_tf = ?');
        params.push(exitIndicatorType, exitIndicatorTf);
      }

      if (params.length === 0) {
        return Response.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
      }

      params.push(id);

      await execute(
        `UPDATE trading_setups SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
      const updated = await queryOne<TradingSetup>('SELECT * FROM trading_setups WHERE id = ?', [id]);
      return Response.json({ success: true, data: updated });
    }

    if (existing.status === 'closed' || existing.status === 'canceled') {
      return Response.json(
        { success: false, error: 'Cannot edit closed or canceled setups' },
        { status: 400 }
      );
    }

    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const account = await queryOne<{ id: number; user_id: number }>(
      'SELECT id, user_id FROM bybit_accounts WHERE id = ?',
      [data.account_id]
    );
    if (!account || account.user_id !== auth.userId) {
      return unauthorizedResponse();
    }

    if (existing.status === 'triggered') {
      await execute(
        `UPDATE trading_setups SET
          account_id = ?, symbol = ?, side = ?, memo = ?,
          entry_indicator_type = ?, entry_indicator_tf = ?,
          risk_type = ?, risk_value = ?, sl_price = ?, tp_prices = ?,
          be_enabled = ?, be_trigger_price = ?,
          exit_indicator_type = ?, exit_indicator_tf = ?,
          updated_at = datetime('now')
        WHERE id = ?`,
        [
          data.account_id, data.symbol, data.side, data.memo || null,
          data.entry_indicator_type, data.entry_indicator_tf,
          data.risk_type, data.risk_value, data.sl_price || 0,
          JSON.stringify(data.tp_prices),
          data.be_enabled ? 1 : 0, data.be_trigger_price || 0,
          data.exit_indicator_type || null, data.exit_indicator_tf || null,
          id,
        ]
      );
      const updated = await queryOne<TradingSetup>('SELECT * FROM trading_setups WHERE id = ?', [id]);
      return Response.json({ success: true, data: updated });
    }

    await execute(
      `UPDATE trading_setups SET
        account_id = ?, symbol = ?, side = ?, memo = ?,
        activation_price = ?, ignore_box_upper = ?, ignore_box_lower = ?,
        entry_indicator_type = ?, entry_indicator_tf = ?,
        risk_type = ?, risk_value = ?, sl_price = ?, tp_prices = ?,
        be_enabled = ?, be_trigger_price = ?,
        exit_indicator_type = ?, exit_indicator_tf = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
      [
        data.account_id, data.symbol, data.side, data.memo || null,
        data.activation_price, data.ignore_box_upper, data.ignore_box_lower,
        data.entry_indicator_type, data.entry_indicator_tf,
        data.risk_type, data.risk_value, data.sl_price || 0,
        JSON.stringify(data.tp_prices),
        data.be_enabled ? 1 : 0, data.be_trigger_price || 0,
        data.exit_indicator_type || null, data.exit_indicator_tf || null,
        id,
      ]
    );

    const updated = await queryOne<TradingSetup>('SELECT * FROM trading_setups WHERE id = ?', [id]);
    return Response.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT setup error:', err);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = getAuthFromRequest(_request);
    if (!auth) return unauthorizedResponse();

    const existing = await queryOne<TradingSetup>(
      'SELECT * FROM trading_setups WHERE id = ? AND user_id = ?',
      [id, auth.userId]
    );
    if (!existing) {
      return Response.json({ success: false, error: 'Setup not found' }, { status: 404 });
    }

    if (existing.status !== 'pending' && existing.status !== 'triggered') {
      return Response.json(
        { success: false, error: 'Can only cancel pending or triggered setups' },
        { status: 400 }
      );
    }

    await execute(
      "UPDATE trading_setups SET status = 'canceled', closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      [id]
    );

    const updated = await queryOne<TradingSetup>('SELECT * FROM trading_setups WHERE id = ?', [id]);
    return Response.json({ success: true, data: updated });
  } catch (err) {
    console.error('DELETE setup error:', err);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}