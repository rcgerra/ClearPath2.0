import axios from 'axios';
import { env, isDataverseConfigured } from '../config/env';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

/** Client-credentials (application user) token for the Dataverse Web API. */
export async function getAccessToken(): Promise<string> {
  if (!isDataverseConfigured()) {
    throw Object.assign(new Error('Dataverse is not configured. Set DATAVERSE_* values in backend/.env.'), {
      status: 503,
    });
  }

  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.accessToken;
  if (inFlight) return inFlight;

  const tokenUrl = `https://login.microsoftonline.com/${env.dataverse.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.dataverse.clientId,
    client_secret: env.dataverse.clientSecret,
    scope: `${env.dataverse.url}/.default`,
  });

  inFlight = axios
    .post(tokenUrl, body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    .then((response) => {
      const { access_token: accessToken, expires_in: expiresIn } = response.data as {
        access_token: string;
        expires_in: number;
      };
      cached = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
      return accessToken;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function clearTokenCache(): void {
  cached = null;
}
