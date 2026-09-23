import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export type AccentName = 'requests' | 'projects' | 'departments' | 'people' | 'access';

interface Props {
  accent: AccentName;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  headerContent?: ReactNode;
  children: ReactNode;
  showBackButton?: boolean;
  collapsible?: boolean;
}

/** Full-bleed section tinted with the area accent at ~10% opacity. */
export default function AccentSection({
  accent,
  title,
  subtitle,
  actions,
  headerContent,
  children,
  showBackButton = true,
  collapsible = false,
}: Props) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const contentId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-content`;

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
        {(headerContent || actions || collapsible) && (
          <div className="row-actions">
            {headerContent}
            {actions}
            {collapsible && (
              <button
                type="button"
                className="workload-collapse-button"
                aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
                aria-expanded={!collapsed}
                aria-controls={contentId}
                title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
                onClick={() => setCollapsed((value) => !value)}
              >
                <span className={collapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
      <div id={contentId} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
