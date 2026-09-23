import { FormEvent, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, errorMessage, lookupsApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import UserSelect from '../../components/admin/UserSelect';

function dateInputValue(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export default function DepartmentEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Shared by the admin and front-end routes; return to whichever view we came from.
  const inAdmin = useLocation().pathname.startsWith('/admin');
  const listPath = inAdmin ? '/admin/departments' : isNew ? '/departments' : `/departments/${id}`;

  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const functions = useQuery({ queryKey: ['lookups', 'functions'], queryFn: () => lookupsApi.list('functions') });

  const current = isNew ? undefined : departments.data?.find((dept) => dept.id === id);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew ? departmentsApi.create(body) : departmentsApi.update(id!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      navigate(listPath);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || '').trim() || undefined;
    save.mutate({
      name: text('name'),
      leadPersonId: text('leadPersonId'),
      delegatePersonId: text('delegatePersonId'),
      functionId: text('functionId'),
      lastCheckIn: isNew ? undefined : text('lastCheckIn'),
      isActive: form.get('isActive') === 'on',
    });
  }

  return (
    <AccentSection
      accent="departments"
      title={isNew ? 'New department' : (current?.name ?? 'Edit department')}
      subtitle={isNew ? 'Create a department record.' : 'Update department details.'}
    >
      {error && <div className="alert error">{error}</div>}
      <form className="card" onSubmit={handleSubmit} key={current?.id ?? 'new'}>
        <div className="field">
          <label htmlFor="name">Department name</label>
          <input id="name" name="name" required maxLength={200} defaultValue={current?.name ?? ''} />
        </div>

        <div className={isNew ? 'grid cols-2' : 'grid cols-3'}>
          <UserSelect id="leadPersonId" name="leadPersonId" label="Department lead" personValue defaultValue={current?.leadPersonId} />
          <div className="field">
            <label htmlFor="functionId">Function</label>
            <select id="functionId" name="functionId" defaultValue={current?.functionId ?? ''}>
              <option value="">—</option>
              {functions.data?.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.name}
                </option>
              ))}
            </select>
          </div>
          {!isNew && (
            <div className="field">
              <label htmlFor="lastCheckIn">Last check-in</label>
              <input
                id="lastCheckIn"
                name="lastCheckIn"
                type="date"
                defaultValue={dateInputValue(current?.lastCheckIn)}
              />
            </div>
          )}
        </div>

        <div style={{ maxWidth: 320 }}>
          <UserSelect id="delegatePersonId" name="delegatePersonId" label="Department delegate" personValue defaultValue={current?.delegatePersonId} />
        </div>

        <label className="switch" style={{ marginBottom: '1rem' }}>
          <input type="checkbox" name="isActive" defaultChecked={current?.isActive !== false} />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-label">Active</span>
        </label>

        <div className="row-actions">
          <button className="accent-button" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save department'}
          </button>
          <button type="button" onClick={() => navigate(listPath)}>
            Cancel
          </button>
        </div>
      </form>
    </AccentSection>
  );
}
