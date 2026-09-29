import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';
import { env } from '../config/env';
import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';

interface GraphUser {
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string;
  jobTitle?: string | null;
  accountEnabled?: boolean;
}

let client: ConfidentialClientApplication | undefined;

function getClient(): ConfidentialClientApplication {
  if (!env.graphClientId || !env.graphClientSecret || !env.entraTenantId) {
    throw Object.assign(new Error('Microsoft Graph directory lookup is not configured. Add GRAPH_CLIENT_ID and a rotated GRAPH_CLIENT_SECRET.'), { status: 503 });
  }
  client ??= new ConfidentialClientApplication({
    auth: {
      clientId: env.graphClientId,
      authority: `https://login.microsoftonline.com/${env.entraTenantId}`,
      clientSecret: env.graphClientSecret,
    },
  });
  return client;
}

export async function searchEntraUsers(search: string) {
  const term = search.trim();
  if (term.length < 3) return [];
  const token = await getClient().acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
  if (!token?.accessToken) throw new Error('Microsoft Graph did not issue an access token.');

  const response = await axios.get<{ value: GraphUser[] }>('https://graph.microsoft.com/v1.0/users', {
    params: {
      '$search': `"displayName:${term.replace(/"/g, '\\"')}"`,
      '$select': 'id,displayName,mail,userPrincipalName,jobTitle,accountEnabled',
      '$top': 25,
      '$count': true,
    },
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      ConsistencyLevel: 'eventual',
    },
    timeout: 15000,
  });

  const users = (response.data.value ?? []).filter((user) => user.accountEnabled !== false && user.id && user.displayName);
  const systemUsers = env.demoMode ? [] : await dv.list('users', {
    select: [COLUMNS.users.id, COLUMNS.users.entraObjectId],
    top: 5000,
    includeFormattedValues: false,
  });
  const systemUserByEntraId = new Map(systemUsers.map((user) => [
    String(user[COLUMNS.users.entraObjectId] ?? '').toLowerCase(), String(user[COLUMNS.users.id]),
  ]));

  return users.map((user) => ({
    id: user.id,
    userId: env.demoMode ? user.id : systemUserByEntraId.get(user.id.toLowerCase()),
    fullName: user.displayName!,
    email: user.mail || user.userPrincipalName || undefined,
    jobTitle: user.jobTitle || undefined,
  }));
}
