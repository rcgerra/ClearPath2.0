import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi, errorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

const SESSION_USER_KEY = 'clearpath-selected-user';

/** Temporary passwordless user selection. TODO(Entra): replace with MSAL/Entra sign-in. */
export default function SessionGate({ children }: { children: ReactNode }) {
  const { token, setSession } = useAuthStore();
  const [selectedUserId, setSelectedUserId] = useState(() => sessionStorage.getItem(SESSION_USER_KEY) ?? '');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const users = useQuery({ queryKey: ['auth-users', search], queryFn: () => authApi.users(search), enabled: !token });

  useEffect(() => {
    if (!selectedUserId || token) return;
    let cancelled = false;
    authApi.session(selectedUserId).then(({ token: issued, user }) => { if (!cancelled) setSession(issued, user); }).catch((err) => { if (!cancelled) { sessionStorage.removeItem(SESSION_USER_KEY); setSelectedUserId(''); setError(errorMessage(err)); } });
    return () => { cancelled = true; };
  }, [selectedUserId, token, setSession]);

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
      <div className="session-screen">
        <div className="session-card">
          <h1>ClearPath 2.0</h1>
          <div className="alert error">{error}</div>
          <p className="muted">
            Select an active temporary user to continue. No password is required.
          </p>
          <button className="primary" onClick={() => setError(null)}>Choose user</button>
        </div>
      </div>
    );
  }

  if (!token && selectedUserId) {
    return (
      <div className="session-screen">
        <div className="session-card">
          <h1>ClearPath 2.0</h1>
          <p className="muted">Starting your session…</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="session-screen">
        <div className="session-card">
          <h1>ClearPath 2.0</h1>
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
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
