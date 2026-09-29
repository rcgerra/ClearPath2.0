import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../../api/client';

interface Props {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  personValue?: boolean;
  required?: boolean;
  searchable?: boolean;
}

export default function UserSelect({ id, name, label, defaultValue = '', personValue = false, required = false, searchable = true }: Props) {
  const [search, setSearch] = useState('');
  const users = useQuery({
    queryKey: ['users', 'lookup', search],
    queryFn: () => usersApi.search(search),
  });
  const selected = users.data?.find((user) => (personValue ? user.personId : user.id) === defaultValue);

  return (
    <div className="field">
      <label htmlFor={searchable ? `${id}-search` : id}>
        {label}{required && <> <span className="required-marker" aria-hidden="true">*</span></>}
      </label>
      {searchable && (
        <input
          id={`${id}-search`}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name"
          aria-label={`Search ${label.toLowerCase()}`}
        />
      )}
      <select id={id} name={name} defaultValue={defaultValue} required={required}>
        <option value="">—</option>
        {selected && !users.data?.some((user) => (personValue ? user.personId : user.id) === defaultValue) && (
          <option value={defaultValue}>{selected.fullName}</option>
        )}
        {users.data?.map((user) => {
          const value = personValue ? user.personId : user.id;
          if (!value) return null;
          return (
            <option key={value} value={value}>
              {user.fullName}{user.email ? ` (${user.email})` : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}