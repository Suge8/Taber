import { BrowserOAuthError, refreshOAuthToken, readBearerTokens } from './oauth-browser.ts';

export const XAI_OAUTH_ISSUER = 'https://auth.x.ai';
export const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
export const XAI_OAUTH_AUTHORIZE_URL = `${XAI_OAUTH_ISSUER}/oauth2/authorize`;
export const XAI_OAUTH_TOKEN_URL = `${XAI_OAUTH_ISSUER}/oauth2/token`;
export const XAI_OAUTH_REDIRECT_URI = 'http://127.0.0.1:56121/callback';
export const XAI_OAUTH_SCOPES = 'openid profile email offline_access grok-cli:access api:access';
export const XAI_API_BASE_URL = 'https://api.x.ai/v1';
export const XAI_DEFAULT_MODEL_ID = 'grok-4.5';
export const XAI_DEFAULT_MODEL_NAME = 'Grok 4.5';
export const XAI_DEFAULT_CONTEXT_WINDOW = 500_000;
export const XAI_SUPPORTED_REASONING_EFFORTS = ['low', 'medium', 'high'] as const;

export type XaiAuthFailureKind = 'auth' | 'token_exchange' | 'network' | 'timeout' | 'aborted' | 'unexpected_response';

export class XaiAuthError extends Error {
  readonly kind: XaiAuthFailureKind;

  constructor(kind: XaiAuthFailureKind, message: string) {
    super(message);
    this.name = 'XaiAuthError';
    this.kind = kind;
  }
}

export type XaiAuthTokens = {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: number;
  email?: string;
  name?: string;
};

export type XaiModelDef = {
  name: string;
  displayName: string;
  contextWindowTokens: number;
  supportedReasoningEfforts: string[];
  defaultReasoningEffort: string;
};

export const XAI_MODELS: XaiModelDef[] = [
  {
    name: XAI_DEFAULT_MODEL_ID,
    displayName: XAI_DEFAULT_MODEL_NAME,
    contextWindowTokens: XAI_DEFAULT_CONTEXT_WINDOW,
    supportedReasoningEfforts: [...XAI_SUPPORTED_REASONING_EFFORTS],
    defaultReasoningEffort: 'high',
  },
];

export async function refreshXaiTokens(refreshToken: string, options: { fetch?: typeof fetch; signal?: AbortSignal; now?: number } = {}): Promise<XaiAuthTokens> {
  try {
    const body = await refreshOAuthToken({
      tokenUrl: XAI_OAUTH_TOKEN_URL,
      refreshToken,
      clientId: XAI_OAUTH_CLIENT_ID,
      fetch: options.fetch,
      signal: options.signal,
    });
    return parseXaiTokenResponse(body, options.now ?? Date.now(), refreshToken);
  } catch (error) {
    throw mapXaiError(error);
  }
}

export function parseXaiTokenResponse(body: Record<string, unknown>, now = Date.now(), fallbackRefresh?: string): XaiAuthTokens {
  try {
    const tokens = readBearerTokens(
      {
        ...body,
        refresh_token: body.refresh_token ?? fallbackRefresh,
      },
      now,
    );
    const meta = parseXaiTokenMetadata({ accessToken: tokens.accessToken, idToken: tokens.idToken });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      ...(tokens.idToken ? { idToken: tokens.idToken } : {}),
      expiresAt: tokens.expiresAt,
      ...(meta.email ? { email: meta.email } : {}),
      ...(meta.name ? { name: meta.name } : {}),
    };
  } catch (error) {
    throw mapXaiError(error);
  }
}

/** Best-effort identity from OIDC id_token / access token claims. */
export function parseXaiTokenMetadata(tokens: { accessToken?: string; idToken?: string }) {
  const idClaims = tokens.idToken ? decodeJwtClaims(tokens.idToken) : undefined;
  const accessClaims = tokens.accessToken ? decodeJwtClaims(tokens.accessToken) : undefined;
  return {
    email: readEmail(idClaims) ?? readEmail(accessClaims),
    name: readName(idClaims) ?? readName(accessClaims),
  };
}

function decodeJwtClaims(jwt: string): Record<string, unknown> | undefined {
  const payload = jwt.split('.')[1];
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const value = JSON.parse(json) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function readEmail(claims?: Record<string, unknown>) {
  if (!claims) return undefined;
  return readClaimString(claims.email) ?? readClaimString(claims.preferred_username);
}

function readName(claims?: Record<string, unknown>) {
  if (!claims) return undefined;
  return readClaimString(claims.name) ?? readClaimString(claims.preferred_username) ?? readClaimString(claims.sub);
}

function readClaimString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function mapXaiError(error: unknown): XaiAuthError {
  if (error instanceof XaiAuthError) return error;
  if (error instanceof BrowserOAuthError) {
    const kind =
      error.kind === 'token_exchange' || error.kind === 'timeout' || error.kind === 'aborted' || error.kind === 'unexpected_response'
        ? error.kind
        : 'auth';
    return new XaiAuthError(kind, error.message);
  }
  return new XaiAuthError('auth', error instanceof Error ? error.message : String(error));
}
