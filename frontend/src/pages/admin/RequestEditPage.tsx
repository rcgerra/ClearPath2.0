import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, requestsApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import UserSelect from '../../components/admin/UserSelect';
import LocationChipPicker from '../../components/LocationChipPicker';
import { DEFAULT_REQUEST_PHASE, REQUEST_PHASES } from '../../constants/phases';
import { REQUEST_DISPOSITIONS } from '../../types';

export default function RequestEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const request = useQuery({ queryKey: ['request', id], queryFn: () => requestsApi.get(id!), enabled: Boolean(id) });

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
      disposition: text('disposition'),
      location: text('location'),
      delegatePersonId: text('delegatePersonId'),
      sponsorPersonId: text('sponsorPersonId'),
      isActive: form.get('isActive') === 'on',
      neededBy: text('neededBy'),
      neededByJustification: text('neededByJustification'),
      currentState: text('currentState'),
      discoveryMethod: text('discoveryMethod'),
      impactToOperations: text('impactToOperations'),
      desiredFutureState: text('desiredFutureState'),
      additionalInformation: text('additionalInformation'),
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
              <label htmlFor="shortTitle">Short Title</label>
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
              <label htmlFor="disposition">Disposition</label>
              <select id="disposition" name="disposition" defaultValue={current?.disposition ?? 'Pending'}>
                {REQUEST_DISPOSITIONS.map((disposition) => (
                  <option key={disposition} value={disposition}>
                    {disposition}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="neededBy">Needed By</label>
              <input id="neededBy" name="neededBy" type="date" defaultValue={current?.neededBy?.slice(0, 10) ?? ''} />
            </div>
          </div>

          <div className="field">
            <LocationChipPicker id="location" name="location" defaultValue={current?.location ?? ''} />
          </div>

          <div className="grid cols-2">
            <UserSelect id="sponsorPersonId" name="sponsorPersonId" label="Proposed Sponsor" personValue defaultValue={current?.sponsorPersonId} />
            <UserSelect id="delegatePersonId" name="delegatePersonId" label="Delegates" personValue defaultValue={current?.delegatePersonId} />
          </div>

          <div className="field">
            <label htmlFor="neededByJustification">Rationale</label>
            <textarea
              id="neededByJustification"
              name="neededByJustification"
              maxLength={4000}
              defaultValue={current?.neededByJustification ?? ''}
            />
          </div>

          <div className="field">
            <label htmlFor="currentState">Current State</label>
            <textarea
              id="currentState"
              name="currentState"
              maxLength={4000}
              defaultValue={current?.currentState ?? ''}
            />
          </div>

          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="discoveryMethod">Discovery Method</label>
              <textarea
                id="discoveryMethod"
                name="discoveryMethod"
                maxLength={4000}
                defaultValue={current?.discoveryMethod ?? ''}
              />
            </div>
            <div className="field">
              <label htmlFor="impactToOperations">Impact to Operations</label>
              <textarea
                id="impactToOperations"
                name="impactToOperations"
                maxLength={4000}
                defaultValue={current?.impactToOperations ?? ''}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="desiredFutureState">Desired Future State</label>
            <textarea
              id="desiredFutureState"
              name="desiredFutureState"
              maxLength={4000}
              defaultValue={current?.desiredFutureState ?? ''}
            />
          </div>

          <div className="field">
            <label htmlFor="additionalInformation">Additional Information</label>
            <textarea
              id="additionalInformation"
              name="additionalInformation"
              maxLength={4000}
              defaultValue={current?.additionalInformation ?? ''}
            />
          </div>

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
