import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne } from '@/db/client';
import { loginSchema } from '@/lib/validation';
import { signToken, setTokenCookie } from '@/lib/auth';
import { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    const user = await queryOne<User>('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return Response.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return Response.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const token = signToken({ userId: user.id, email: user.email });
    const response = Response.json({
      success: true,
      data: { userId: user.id, email: user.email },
    });
    setTokenCookie(response, token);
    return response;
  } catch (err) {
    console.error('Login error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}