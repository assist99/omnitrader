import { NextRequest } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { queryAll } from '@/db/client';
import { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const setupId = searchParams.get('setup_id');

  let sql = 'SELECT o.* FROM orders o INNER JOIN trading_setups ts ON o.setup_id = ts.id WHERE ts.user_id = ?';
  const params: any[] = [auth.userId];

  if (setupId) {
    sql += ' AND o.setup_id = ?';
    params.push(setupId);
  }

  sql += ' ORDER BY o.created_at DESC';

  const orders = await queryAll<Order>(sql, params);
  return Response.json({ success: true, data: orders });
}