const LOCAL_GOOGLE_CLIENT_ID_KEY = 'strike.googleClientId.v1';
const PENDING_OAUTH_KEY = 'strike.googleOAuthPending.v1';
const PENDING_OAUTH_TTL_MS = 15 * 60 * 1000;

interface PendingOAuthRecord {
  state: string;
  nonce: string;
  createdAt: number;
}

export type GoogleOAuthCallbackResult =
  | { status: 'success'; idToken: string }
  | { status: 'error'; message: string };

export function getEnvGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';
}

export function getStoredGoogleClientId(): string {
  try {
    return localStorage.getItem(LOCAL_GOOGLE_CLIENT_ID_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function resolveGoogleClientId(): {
  clientId: string;
  source: 'env' | 'local' | null;
} {
  const envId = getEnvGoogleClientId();
  if (envId) return { clientId: envId, source: 'env' };
  const localId = getStoredGoogleClientId();
  if (localId) return { clientId: localId, source: 'local' };
  return { clientId: '', source: null };
}

export function saveLocalGoogleClientId(clientId: string): void {
  const trimmed = clientId.trim();
  if (!trimmed) {
    localStorage.removeItem(LOCAL_GOOGLE_CLIENT_ID_KEY);
    return;
  }
  localStorage.setItem(LOCAL_GOOGLE_CLIENT_ID_KEY, trimmed);
}

export function clearLocalGoogleClientId(): void {
  localStorage.removeItem(LOCAL_GOOGLE_CLIENT_ID_KEY);
}

export function getGoogleOAuthRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function generateRandomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function buildGoogleOAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const search = new URLSearchParams({
    client_id: params.clientId.trim(),
    redirect_uri: params.redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: params.nonce,
    state: params.state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${search.toString()}`;
}

export function beginDirectGoogleSignIn(clientId: string): void {
  const cleanId = clientId.trim();
  if (!cleanId) {
    throw new Error('Google Web Client ID is required for direct mobile sign-in.');
  }

  const state = generateRandomToken();
  const nonce = generateRandomToken();
  const record: PendingOAuthRecord = {
    state,
    nonce,
    createdAt: Date.now(),
  };

  localStorage.setItem(PENDING_OAUTH_KEY, JSON.stringify(record));

  const authUrl = buildGoogleOAuthUrl({
    clientId: cleanId,
    redirectUri: getGoogleOAuthRedirectUri(),
    state,
    nonce,
  });

  window.location.assign(authUrl);
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Malformed Google ID token.');
  }

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const decoded = atob(padded);
  return JSON.parse(decoded) as Record<string, unknown>;
}

/**
 * Inspects window.location.hash for a direct Google OAuth id_token callback.
 * Clears the URL hash immediately and validates CSRF state + OIDC nonce.
 */
export function consumeGoogleOAuthHashCallback(
  hashOverride?: string,
  now: number = Date.now()
): GoogleOAuthCallbackResult | null {
  const rawHash = (hashOverride ?? window.location.hash).replace(/^#/, '');
  if (!rawHash) return null;

  const params = new URLSearchParams(rawHash);
  const idToken = params.get('id_token');
  const oauthError = params.get('error');
  const returnedState = params.get('state');

  if (!idToken && !oauthError) {
    return null;
  }

  // Scrub sensitive token/error parameters from browser URL bar & history immediately
  if (hashOverride === undefined && typeof window.history?.replaceState === 'function') {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }

  let pending: PendingOAuthRecord | null = null;
  try {
    const rawPending = localStorage.getItem(PENDING_OAUTH_KEY);
    if (rawPending) {
      pending = JSON.parse(rawPending) as PendingOAuthRecord;
    }
  } catch {
    pending = null;
  } finally {
    localStorage.removeItem(PENDING_OAUTH_KEY);
  }

  if (oauthError) {
    const errorDesc = params.get('error_description');
    if (oauthError === 'access_denied') {
      return { status: 'error', message: 'Google sign-in was cancelled.' };
    }
    return {
      status: 'error',
      message: errorDesc ? `Google sign-in error: ${errorDesc}` : `Google sign-in error (${oauthError}).`,
    };
  }

  if (!pending || !pending.state || !pending.nonce) {
    return {
      status: 'error',
      message: 'Google sign-in session expired. Please tap Continue with Google again.',
    };
  }

  if (now - pending.createdAt > PENDING_OAUTH_TTL_MS) {
    return {
      status: 'error',
      message: 'Google sign-in timed out. Please try signing in again.',
    };
  }

  if (!returnedState || returnedState !== pending.state) {
    return {
      status: 'error',
      message: 'Google sign-in verification failed (state mismatch). Please try again.',
    };
  }

  if (!idToken) {
    return { status: 'error', message: 'Google did not return an ID token.' };
  }

  try {
    const payload = decodeJwtPayload(idToken);
    if (payload.nonce !== pending.nonce) {
      return {
        status: 'error',
        message: 'Google sign-in verification failed (nonce mismatch). Please try again.',
      };
    }
  } catch {
    return { status: 'error', message: 'Could not verify Google ID token.' };
  }

  return { status: 'success', idToken };
}
