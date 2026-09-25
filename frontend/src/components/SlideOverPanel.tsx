import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/** Right-hand slide-over used to keep secondary detail out of the main flow until requested. */
export default function SlideOverPanel({
  open,
  onClose,
  title,
  subtitle,
  headerActions,
  size = 'default',
  hideHeader = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Rendered beside the Close button, e.g. Discard/Apply actions for an editing workflow. */
  headerActions?: ReactNode;
  /** 'wide' gives more room for content like weekly matrices that need horizontal space. */
  size?: 'default' | 'wide';
  /** Skip the built-in title/close header when the content renders its own (e.g. ConflictResolutionPanel). */
  hideHeader?: boolean;
  children: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Rendered via portal so a fixed-position ancestor (e.g. .accent-section's backdrop-filter) can't
  // constrain this overlay's containing block and shrink it away from the real viewport.
  return createPortal(
    <div className="slide-over-backdrop" onClick={onClose}>
      <section
        className={size === 'wide' ? 'slide-over-panel slide-over-panel-wide' : 'slide-over-panel'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hideHeader ? undefined : 'slide-over-title'}
        onClick={(event) => event.stopPropagation()}
      >
        {!hideHeader && (
          <div className="slide-over-header">
            <div>
              <h3 id="slide-over-title">{title}</h3>
              {subtitle && <p className="muted">{subtitle}</p>}
            </div>
            <div className="slide-over-header-actions">
              {headerActions}
              <button type="button" ref={closeButtonRef} onClick={onClose} aria-label="Close panel">
                Close
              </button>
            </div>
          </div>
        )}
        <div className="slide-over-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

