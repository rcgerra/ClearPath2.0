import type { ReactNode } from 'react';
import { useAuthStore } from '../store/authStore';
import type { Role } from '../types';

interface Props {
  children: ReactNode;
  roles?: Role[];
}

export default function ProtectedRoute({ children, roles }: Props) {
  const user = useAuthStore((state) => state.user);

  if (roles && !user?.roles.some((role) => roles.includes(role))) {
    return (
      <div className="card">
        <h2>Access denied</h2>
        <p className="muted">
          Your roles ({user?.roles.join(', ') || 'none'}) do not grant access to this area.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
