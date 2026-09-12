import { ReactNode, useEffect, useState } from 'react';
import { authApi, errorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

/** Establishes the session from the host identity before rendering the app. */
export default function SessionGate({ children }: { children: ReactNode }) {
  const { token, setSession } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .session()
      .then(({ token: issued, user }) => {
        if (!cancelled) setSession(issued, user);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [setSession]);

  if (error) {
    return (
      <div className="session-screen">
        <div className="session-card">
          <h1>ClearPath 2.0</h1>
          <div className="alert error">{error}</div>
          <p className="muted">
            Your Windows or Entra ID account could not be matched to an active directory user. Contact an administrator
            if this persists.
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="session-screen">
        <div className="session-card">
          <h1>ClearPath 2.0</h1>
          <p className="muted">Signing you in…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
