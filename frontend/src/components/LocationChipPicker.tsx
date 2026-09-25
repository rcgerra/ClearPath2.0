import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lookupsApi } from '../api/client';

/** Toggleable location bubbles backed by the shared locations lookup; submits as a semicolon-separated hidden field. */
export default function LocationChipPicker({
  id,
  name,
  label = 'Locations Impacted',
  defaultValue = '',
}: {
  id: string;
  name: string;
  label?: string;
  defaultValue?: string;
}) {
  const locations = useQuery({ queryKey: ['lookups', 'locations'], queryFn: () => lookupsApi.list('locations') });
  const [selected, setSelected] = useState<string[]>(() =>
    defaultValue.split(';').map((value) => value.trim()).filter(Boolean),
  );

  function toggle(name: string) {
    setSelected((current) => (current.includes(name) ? current.filter((value) => value !== name) : [...current, name]));
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input type="hidden" id={id} name={name} value={selected.join('; ')} readOnly />
      <div className="location-chip-row" role="group" aria-label={label}>
        {locations.data?.map((location) => (
          <button
            key={location.id}
            type="button"
            className={selected.includes(location.name) ? 'location-chip active' : 'location-chip'}
            aria-pressed={selected.includes(location.name)}
            onClick={() => toggle(location.name)}
          >
            {location.name}
          </button>
        ))}
        {locations.isLoading && <span className="muted">Loading locations…</span>}
      </div>
    </div>
  );
}
