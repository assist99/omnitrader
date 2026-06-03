import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { queryOne, execute } from '@/db/client';
import { passwordChangeSchema } from '@/lib/validation';
import { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return unauthorizedResponse();

  try {
    const body = await request.json();
    const parsed = passwordChangeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = await queryOne<User>('SELECT * FROM users WHERE id = ?', [auth.userId]);
    if (!user) return unauthorizedResponse();

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return Response.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, auth.userId]);

    return Response.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}