import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { PublicClientApplication } from '@azure/msal-browser';
import { useQuery } from '@tanstack/react-query';
import { authApi, errorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

const SESSION_USER_KEY = 'clearpath-selected-user';

function SessionCard({ children }: { children: ReactNode }) {
  return (
    <div className="session-screen">
      <div className="session-card">
        <img className="brand-logo session-logo" src="/clearpath-logo.png" alt="Takeda" />
        {children}
      </div>
    </div>
  );
}

/** Temporary passwordless user selection. TODO(Entra): replace with MSAL/Entra sign-in. */
export default function SessionGate({ children }: { children: ReactNode }) {
  const { token, user, setSession, logout } = useAuthStore();
  const [selectedUserId, setSelectedUserId] = useState(() => sessionStorage.getItem(SESSION_USER_KEY) ?? '');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const authConfig = useQuery({ queryKey: ['auth-config'], queryFn: authApi.config });
  const users = useQuery({ queryKey: ['auth-users', search], queryFn: () => authApi.users(search), enabled: !token && authConfig.data?.authMode === 'dev' });

  useEffect(() => {
    if (authConfig.data?.authMode === 'entra' && token && user?.authProvider !== 'entra') logout();
  }, [authConfig.data?.authMode, token, user?.authProvider, logout]);

  useEffect(() => {
    if (!selectedUserId || token || authConfig.data?.authMode !== 'dev') return;
    let cancelled = false;
    authApi.session(selectedUserId).then(({ token: issued, user }) => { if (!cancelled) setSession(issued, user); }).catch((err) => { if (!cancelled) { sessionStorage.removeItem(SESSION_USER_KEY); setSelectedUserId(''); setError(errorMessage(err)); } });
    return () => { cancelled = true; };
  }, [selectedUserId, token, authConfig.data?.authMode, setSession]);

  async function signInWithEntra() {
    const config = authConfig.data;
    if (!config?.tenantId || !config.clientId) {
      setError('Entra sign-in is missing its tenant or client configuration.');
      return;
    }
    setIsSigningIn(true);
    setError(null);
    try {
      const msal = new PublicClientApplication({
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'sessionStorage' },
      });
      await msal.initialize();
      const result = await msal.loginPopup({ scopes: ['openid', 'profile', 'email'], prompt: 'select_account' });
      if (!result.idToken) throw new Error('Microsoft Entra did not return an ID token.');
      const session = await authApi.entraLogin(result.idToken);
      sessionStorage.removeItem(SESSION_USER_KEY);
      setSession(session.token, session.user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSigningIn(false);
    }
  }

  function chooseUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('userId')?.toString() ?? '';
    if (!value) return;
    sessionStorage.setItem(SESSION_USER_KEY, value);
    setError(null);
    setSelectedUserId(value);
  }

  if (error) {
    return (
      <SessionCard>
        <div className="alert error">{error}</div>
        {authConfig.data?.authMode === 'entra'
          ? <button className="primary" onClick={signInWithEntra} disabled={isSigningIn}>Try Microsoft sign-in again</button>
          : <><p className="muted">Select an active temporary user to continue. No password is required.</p><button className="primary" onClick={() => setError(null)}>Choose user</button></>}
      </SessionCard>
    );
  }

  if (authConfig.isLoading || !authConfig.data) {
    return <SessionCard><p className="muted">Checking sign-in configuration…</p></SessionCard>;
  }

  if (authConfig.data.authMode === 'entra' && !token) {
    return (
      <SessionCard>
        <p className="muted">Sign in with your Takeda account to continue.</p>
        <button className="primary" onClick={signInWithEntra} disabled={isSigningIn}>
          {isSigningIn ? 'Signing in…' : 'Sign in with Microsoft'}
        </button>
      </SessionCard>
    );
  }

  if (!token && selectedUserId) {
    return (
      <SessionCard><p className="muted">Starting your session…</p></SessionCard>
    );
  }

  if (!token) {
    return (
      <SessionCard>
        <p className="muted">Choose your temporary user profile. TODO: Microsoft Entra ID will replace this selector.</p>
        <form onSubmit={chooseUser}>
          <label htmlFor="userSearch">Search by name</label>
          <input id="userSearch" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type a name" />
          <label htmlFor="userId">User</label>
          <select id="userId" name="userId" defaultValue="" required>
            <option value="">Select a user</option>
            {users.data?.map((user) => <option key={user.id} value={user.id}>{user.fullName}{user.email ? ` (${user.email})` : ''}</option>)}
          </select>
          <button className="primary" type="submit" disabled={users.isLoading}>Continue</button>
        </form>
      </SessionCard>
    );
  }

  return <>{children}</>;
}
