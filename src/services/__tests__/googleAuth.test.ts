import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildGoogleOAuthUrl,
  consumeGoogleOAuthHashCallback,
  decodeJwtPayload,
  resolveGoogleClientId,
  saveLocalGoogleClientId,
} from '../googleAuth';

function makeUnsignedJwt(payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.sig`;
}

describe('googleAuth direct OAuth service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds a valid Google OAuth 2.0 id_token redirect URL', () => {
    const url = new URL(
      buildGoogleOAuthUrl({
        clientId: '12345.apps.googleusercontent.com',
        redirectUri: 'https://adityacoder1.github.io/strike-productivity/',
        state: 'state_abc',
        nonce: 'nonce_xyz',
      })
    );

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('12345.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://adityacoder1.github.io/strike-productivity/'
    );
    expect(url.searchParams.get('response_type')).toBe('id_token');
    expect(url.searchParams.get('state')).toBe('state_abc');
    expect(url.searchParams.get('nonce')).toBe('nonce_xyz');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });

  it('persists and resolves local Google Web Client ID', () => {
    expect(resolveGoogleClientId()).toEqual({ clientId: '', source: null });
    saveLocalGoogleClientId('999-test.apps.googleusercontent.com');
    expect(resolveGoogleClientId()).toEqual({
      clientId: '999-test.apps.googleusercontent.com',
      source: 'local',
    });
  });

  it('decodes base64url JWT payload accurately', () => {
    const token = makeUnsignedJwt({ email: 'user@example.com', nonce: 'n_123' });
    expect(decodeJwtPayload(token)).toEqual({ email: 'user@example.com', nonce: 'n_123' });
  });

  it('validates state and nonce on id_token hash callback', () => {
    localStorage.setItem(
      'strike.googleOAuthPending.v1',
      JSON.stringify({ state: 'st_ok', nonce: 'no_ok', createdAt: 1000 })
    );

    const token = makeUnsignedJwt({ sub: '42', nonce: 'no_ok' });
    const result = consumeGoogleOAuthHashCallback(`#state=st_ok&id_token=${token}`, 5000);

    expect(result).toEqual({ status: 'success', idToken: token });
    expect(localStorage.getItem('strike.googleOAuthPending.v1')).toBeNull();
  });

  it('rejects state mismatch and nonce mismatch', () => {
    localStorage.setItem(
      'strike.googleOAuthPending.v1',
      JSON.stringify({ state: 'st_expected', nonce: 'no_expected', createdAt: 1000 })
    );
    const badStateToken = makeUnsignedJwt({ nonce: 'no_expected' });
    const stateErr = consumeGoogleOAuthHashCallback(
      `#state=st_wrong&id_token=${badStateToken}`,
      2000
    );
    expect(stateErr?.status).toBe('error');

    localStorage.setItem(
      'strike.googleOAuthPending.v1',
      JSON.stringify({ state: 'st_expected', nonce: 'no_expected', createdAt: 1000 })
    );
    const badNonceToken = makeUnsignedJwt({ nonce: 'no_wrong' });
    const nonceErr = consumeGoogleOAuthHashCallback(
      `#state=st_expected&id_token=${badNonceToken}`,
      2000
    );
    expect(nonceErr?.status).toBe('error');
  });

  it('handles user cancellation error gracefully', () => {
    const result = consumeGoogleOAuthHashCallback('#error=access_denied&state=abc');
    expect(result).toEqual({ status: 'error', message: 'Google sign-in was cancelled.' });
  });
});
