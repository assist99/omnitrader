import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { execute, queryOne } from '@/db/client';
import { registerSchema } from '@/lib/validation';
import { signToken, setTokenCookie } from '@/lib/auth';
import { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    const existing = await queryOne<User>('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return Response.json(
        { success: false, error: 'Email already registered' },
        { status: 409 }
      );
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await execute(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, password_hash]
    );

    const token = signToken({ userId: result.lastID, email });
    const response = Response.json(
      { success: true, data: { userId: result.lastID, email } },
      { status: 201 }
    );
    setTokenCookie(response, token);
    return response;
  } catch (err) {
    console.error('Register error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}