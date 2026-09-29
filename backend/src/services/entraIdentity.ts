import jwt, { JwtHeader, JwtPayload, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { env } from '../config/env';

const issuer = `https://login.microsoftonline.com/${env.entraTenantId}/v2.0`;
const keys = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${env.entraTenantId}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

function signingKey(header: JwtHeader, callback: SigningKeyCallback): void {
  if (!header.kid) {
    callback(new Error('Entra token is missing a signing key ID.'));
    return;
  }
  keys.getSigningKey(header.kid).then(
    (key) => callback(null, key.getPublicKey()),
    (error: Error) => callback(error),
  );
}

export interface EntraIdentity {
  email: string;
  name: string;
}

export async function verifyEntraIdToken(idToken: string): Promise<EntraIdentity> {
  if (!env.entraTenantId || !env.entraClientId) {
    throw new Error('Entra authentication is not configured.');
  }

  const payload = await new Promise<JwtPayload>((resolve, reject) => {
    jwt.verify(idToken, signingKey, {
      algorithms: ['RS256'],
      audience: env.entraClientId,
      issuer,
    }, (error, decoded) => {
      if (error) {
        reject(error);
        return;
      }
      if (!decoded || typeof decoded === 'string') {
        reject(new Error('Entra token payload is invalid.'));
        return;
      }
      resolve(decoded);
    });
  });

  if (String(payload.tid ?? '').toLowerCase() !== env.entraTenantId.toLowerCase()) {
    throw new Error('Entra token belongs to a different tenant.');
  }
  const email = String(payload.preferred_username ?? payload.email ?? '').trim().toLowerCase();
  const name = String(payload.name ?? '').trim();
  if (!email || !name) throw new Error('Entra token is missing the user email or display name.');
  return { email, name };
}
