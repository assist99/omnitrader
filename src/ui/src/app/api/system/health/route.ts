import { getDb } from '@/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getDb();
    return Response.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (_err) {
    console.error('Health check error:', _err);
    return Response.json(
      {
        success: false,
        data: { status: 'unhealthy' },
      },
      { status: 500 }
    );
  }
}