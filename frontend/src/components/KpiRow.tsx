import type { ReactNode } from 'react';

export interface KpiItem {
  key?: string;
  value: ReactNode;
  label: string;
  /** Highlights the value in the danger color when the metric needs attention. */
  risk?: boolean;
  /** Extra class name for item-specific styling (e.g. a severity-scaled accent border). */
  className?: string;
}

/** Shared KPI strip so risk/health numbers look and behave the same everywhere they appear. */
export default function KpiRow({
  items,
  variant = 'inline',
  ariaLabel,
  className,
}: {
  items: KpiItem[];
  variant?: 'grid' | 'inline' | 'compact';
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={[`kpi-row kpi-row-${variant}`, className].filter(Boolean).join(' ')} aria-label={ariaLabel}>
      {items.map((item, index) => (
        <div
          key={item.key ?? index}
          className={[item.risk ? 'is-risk' : '', item.className ?? ''].filter(Boolean).join(' ') || undefined}
        >
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
