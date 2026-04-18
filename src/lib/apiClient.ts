let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const rawText = await res.text().catch(() => '');
    let body: any = { error: `Request failed (HTTP ${res.status} ${res.statusText}). Body: ${rawText.slice(0, 100)}` };
    try {
      if (rawText) body = JSON.parse(rawText);
    } catch (e) { }
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res;
}
