import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export type AccentName = 'requests' | 'projects' | 'departments' | 'people' | 'access';

interface Props {
  accent: AccentName;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  showBackButton?: boolean;
}

/** Full-bleed section tinted with the area accent at ~10% opacity. */
export default function AccentSection({ accent, title, subtitle, actions, children, showBackButton = true }: Props) {
  const navigate = useNavigate();

  return (
    <section className={`accent-section accent-${accent}`}>
      <div className="accent-section-header">
        <div className="page-header-row">
          {showBackButton && (
            <button
              type="button"
              className="back-button page-header-back-button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              title="Go back"
            >
              ←
            </button>
          )}
          <div>
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="row-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
