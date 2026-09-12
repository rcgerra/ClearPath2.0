import { ReactNode } from 'react';

export type AccentName = 'requests' | 'projects' | 'departments' | 'people' | 'access';

interface Props {
  accent: AccentName;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Full-bleed section tinted with the area accent at ~10% opacity. */
export default function AccentSection({ accent, title, subtitle, actions, children }: Props) {
  return (
    <section className={`accent-section accent-${accent}`}>
      <div className="accent-section-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="row-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
