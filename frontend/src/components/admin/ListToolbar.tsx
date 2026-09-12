import type { OwnershipScope } from '../../utils/ownership';

interface ToggleSpec {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface SelectSpec {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
}

interface Props {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  /** "Just Mine" / "Everyone's" segmented switch. */
  scope?: {
    value: OwnershipScope;
    onChange: (value: OwnershipScope) => void;
    disabled?: boolean;
  };
  selects?: SelectSpec[];
  toggles?: ToggleSpec[];
}

export default function ListToolbar({
  search,
  onSearch,
  placeholder = 'Search…',
  scope,
  selects = [],
  toggles = [],
}: Props) {
  return (
    <div className="list-toolbar">
      <div className="search-field">
        <span className="search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>

      {scope && (
        <div className="segmented" role="group" aria-label="Record ownership">
          <button
            type="button"
            className={scope.value === 'mine' ? 'active' : ''}
            onClick={() => scope.onChange('mine')}
            disabled={scope.disabled}
            title={scope.disabled ? 'Your account is not linked to a person record.' : undefined}
          >
            Just Mine
          </button>
          <button type="button" className={scope.value === 'all' ? 'active' : ''} onClick={() => scope.onChange('all')}>
            Everyone&apos;s
          </button>
        </div>
      )}

      {selects.map((select) => (
        <div className="toolbar-select" key={select.label}>
          <label htmlFor={`filter-${select.label}`}>{select.label}</label>
          <select
            id={`filter-${select.label}`}
            value={select.value}
            onChange={(event) => select.onChange(event.target.value)}
          >
            <option value="">{select.allLabel ?? 'All'}</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {toggles.map((toggle) => (
        <label className="switch" key={toggle.label}>
          <input type="checkbox" checked={toggle.checked} onChange={(event) => toggle.onChange(event.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-label">{toggle.label}</span>
        </label>
      ))}
    </div>
  );
}
