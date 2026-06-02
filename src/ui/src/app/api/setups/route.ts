import { NextRequest } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { execute, queryAll, queryOne } from '@/db/client';
import { setupSchema } from '@/lib/validation';
import { TradingSetup } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const params: any[] = [auth.userId];
    let whereClause = 'ts.user_id = ?';

    if (status && status !== 'all') {
      if (status === 'closed_canceled') {
        whereClause += " AND ts.status IN ('closed', 'canceled')";
      } else {
        whereClause += ' AND ts.status = ?';
        params.push(status);
      }
    }

    if (search) {
      whereClause += ' AND (ts.symbol LIKE ? OR ts.memo LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    let orderClause = 'ORDER BY ts.created_at DESC';
    if (status === 'closed_canceled') {
      orderClause = 'ORDER BY ts.updated_at DESC';
    }

    const dataSql = `SELECT ts.*, ba.label as account_label FROM trading_setups ts LEFT JOIN bybit_accounts ba ON ts.account_id = ba.id WHERE ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
    const dataParams = [...params, limit, offset];

    const countSql = `SELECT COUNT(*) as total FROM trading_setups ts WHERE ${whereClause}`;
    const countParams = [...params];

    const [setups, countResult] = await Promise.all([
      queryAll<TradingSetup & { account_label: string }>(dataSql, dataParams),
      queryOne<{ total: number }>(countSql, countParams),
    ]);

    return Response.json({
      success: true,
      data: setups,
      total: countResult?.total || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('GET setups error:', err);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  try {
    const body = await request.json();
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
    if (!account) {
      return Response.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }
    if (account.user_id !== auth.userId) {
      return unauthorizedResponse();
    }

    const result = await execute(
      `INSERT INTO trading_setups
        (user_id, account_id, symbol, side, memo, activation_price, ignore_box_upper, ignore_box_lower,
         entry_indicator_type, entry_indicator_tf, risk_type, risk_value, sl_price, tp_prices,
         be_enabled, be_trigger_price, exit_indicator_type, exit_indicator_tf)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        auth.userId, data.account_id, data.symbol, data.side, data.memo || null,
        data.activation_price, data.ignore_box_upper, data.ignore_box_lower,
        data.entry_indicator_type, data.entry_indicator_tf,
        data.risk_type, data.risk_value, data.sl_price || 0,
        JSON.stringify(data.tp_prices),
        data.be_enabled ? 1 : 0, data.be_trigger_price || 0,
        data.exit_indicator_type || null, data.exit_indicator_tf || null,
      ]
    );

    const setup = await queryOne<TradingSetup>('SELECT * FROM trading_setups WHERE id = ?', [result.lastID]);

    return Response.json({ success: true, data: setup }, { status: 201 });
  } catch (err) {
    console.error('Create setup error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}