import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, errorMessage, prioritizationApi, requestsApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import UserSelect from '../../components/admin/UserSelect';
import { DEFAULT_REQUEST_PHASE, REQUEST_PHASES } from '../../constants/phases';

export default function RequestEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const request = useQuery({ queryKey: ['request', id], queryFn: () => requestsApi.get(id!), enabled: Boolean(id) });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const categories = useQuery({ queryKey: ['categories'], queryFn: prioritizationApi.categories });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => requestsApi.update(id!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['request', id] });
      navigate('/admin/requests');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const promote = useMutation({
    mutationFn: () => requestsApi.promote(id!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate(`/admin/projects/${result.projectId}`);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || '').trim() || undefined;
    save.mutate({
      shortTitle: text('shortTitle'),
      spotId: text('spotId'),
      title: text('title'),
      phase: text('phase'),
      departmentId: text('departmentId'),
      categoryId: text('categoryId'),
      delegatePersonId: text('delegatePersonId'),
      isActive: form.get('isActive') === 'on',
      problemStatement: text('problemStatement'),
      businessCase: text('businessCase'),
      expectedBenefit: text('expectedBenefit'),
    });
  }

  const current = request.data;

  return (
    <AccentSection
      accent="requests"
      title={current?.shortTitle ?? current?.title ?? 'Edit request'}
      subtitle={current?.requesterName ? `Requested by ${current.requesterName}` : 'Update request details.'}
      actions={
        <>
          <Link to={`/prioritization?requestId=${id}`}>
            <button type="button">Score request</button>
          </Link>
          <button
            type="button"
            className="accent-button"
            onClick={() => promote.mutate()}
            disabled={promote.isPending || Boolean(current?.projectId)}
          >
            {current?.projectId ? 'Already promoted' : 'Promote to project'}
          </button>
        </>
      }
    >
      {error && <div className="alert error">{error}</div>}
      {request.isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form className="card" onSubmit={handleSubmit} key={current?.id ?? 'edit'}>
          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="shortTitle">Short title</label>
              <input id="shortTitle" name="shortTitle" maxLength={100} defaultValue={current?.shortTitle ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="spotId">SPOT ID</label>
              <input id="spotId" name="spotId" maxLength={50} defaultValue={current?.spotId ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="title">Full title</label>
              <input id="title" name="title" maxLength={200} defaultValue={current?.title ?? current?.name ?? ''} />
            </div>
          </div>

          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="phase">Phase</label>
              <select id="phase" name="phase" defaultValue={current?.phase ?? DEFAULT_REQUEST_PHASE}>
                {REQUEST_PHASES.map((phase) => (
                  <option key={phase} value={phase}>
                    {phase}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="departmentId">Department</label>
              <select id="departmentId" name="departmentId" defaultValue={current?.departmentId ?? ''}>
                <option value="">—</option>
                {departments.data?.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="categoryId">Category</label>
              <select id="categoryId" name="categoryId" defaultValue={current?.categoryId ?? ''}>
                <option value="">—</option>
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="problemStatement">Problem statement</label>
            <textarea
              id="problemStatement"
              name="problemStatement"
              maxLength={4000}
              defaultValue={current?.problemStatement ?? ''}
            />
          </div>

          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="businessCase">Business case</label>
              <textarea
                id="businessCase"
                name="businessCase"
                maxLength={4000}
                defaultValue={current?.businessCase ?? ''}
              />
            </div>
            <div className="field">
              <label htmlFor="expectedBenefit">Expected benefit</label>
              <textarea
                id="expectedBenefit"
                name="expectedBenefit"
                maxLength={4000}
                defaultValue={current?.expectedBenefit ?? ''}
              />
            </div>
          </div>

          <UserSelect id="delegatePersonId" name="delegatePersonId" label="Delegate" personValue defaultValue={current?.delegatePersonId} />

          <label className="switch" style={{ marginBottom: '1rem' }}>
            <input type="checkbox" name="isActive" defaultChecked={current?.isActive !== false} />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-label">Active</span>
          </label>

          <div className="row-actions">
            <button className="accent-button" type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save request'}
            </button>
            <button type="button" onClick={() => navigate('/admin/requests')}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </AccentSection>
  );
}
