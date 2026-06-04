const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || '';

export async function engineFetch(path: string, options: RequestInit = {}) {
  const url = `${ENGINE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}) as Record<string, string>
  };

  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    throw new Error('Unauthorized');
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) throw json || new Error('Request failed');
  return json;
}

export default engineFetch;
