// Signed session token helpers. Web Crypto only, so the same code runs in the
// edge middleware and the node route handler.

const encoder = new TextEncoder();

const hmacHex = async (secret: string, payload: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const SESSION_COOKIE = 'formforge_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 3600;

// Token format: "<expiry-epoch-ms>.<hmac-hex>"
export const createSessionToken = async (secret: string): Promise<string> => {
  const exp = String(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return `${exp}.${await hmacHex(secret, exp)}`;
};

export const verifySessionToken = async (token: string, secret: string): Promise<boolean> => {
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const expMs = parseInt(exp, 10);
  if (isNaN(expMs) || Date.now() > expMs) return false;
  const expected = await hmacHex(secret, exp);
  if (expected.length !== sig.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
};
