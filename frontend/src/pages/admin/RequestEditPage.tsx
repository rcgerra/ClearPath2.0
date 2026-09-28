import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, lookupsApi, requestsApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import UserSelect from '../../components/admin/UserSelect';
import LocationChipPicker from '../../components/LocationChipPicker';
import { DEFAULT_REQUEST_PHASE, REQUEST_PHASES, REQUEST_WORKFLOW, workflowStageIndex } from '../../constants/phases';
import { REQUEST_DISPOSITIONS } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { canEditRequest } from '../../utils/permissions';

export default function RequestEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const isAdminPortal = location.pathname.startsWith('/admin/');
  const backTo = isAdminPortal ? '/admin/requests' : '/requests';
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [workflowCollapsed, setWorkflowCollapsed] = useState(false);

  const request = useQuery({ queryKey: ['request', id], queryFn: () => requestsApi.get(id!), enabled: Boolean(id) });
  const sites = useQuery({ queryKey: ['lookups', 'sites'], queryFn: () => lookupsApi.list('sites') });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => requestsApi.update(id!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['request', id] });
      navigate(backTo);
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
    const submitting = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'submit';
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || '').trim() || undefined;
    if (submitting && !text('location')) {
      setError('Select at least one location impacted.');
      return;
    }
    const changes = {
      shortTitle: text('shortTitle'),
      title: text('shortTitle'),
      siteId: String(form.get('siteId') ?? ''),
      location: text('location'),
      neededBy: text('neededBy'),
      neededByJustification: text('neededByJustification'),
      currentState: text('currentState'),
      discoveryMethod: text('discoveryMethod'),
      impactToOperations: text('impactToOperations'),
      desiredFutureState: text('desiredFutureState'),
      additionalInformation: text('additionalInformation'),
    };
    save.mutate({
      ...changes,
      ...(moderator ? {
        ...(!submitting ? { phase: text('phase') } : {}),
        disposition: text('disposition'),
      } : {}),
      ...(canAssignDelegate ? { sponsorPersonId: text('sponsorPersonId'), delegatePersonId: text('delegatePersonId') } : {}),
      ...(submitting ? { phase: 'Prioritization', status: 'Submitted' } : {}),
    });
  }

  const current = request.data;
  const moderator = Boolean(user?.roles.includes('admin') || user?.roles.includes('intake_moderator'));
  const editable = canEditRequest(user, current);
  const canAssignDelegate = moderator || Boolean(user?.personId && current?.requesterPersonId?.toLowerCase() === user.personId.toLowerCase() && editable);
  const activeStage = workflowStageIndex(current?.phase);
  const isDraft = activeStage === 0;

  return (
    <AccentSection
      accent="requests"
      title={current?.shortTitle ?? current?.title ?? 'Opportunity details'}
      subtitle={current?.requesterName ? `Shared by ${current.requesterName}` : 'Opportunity details'}
      actions={
        isAdminPortal ? <>
          <Link to={`/prioritization?requestId=${id}`}>
            <button type="button">Score opportunity</button>
          </Link>
          <button
            type="button"
            className="accent-button"
            onClick={() => promote.mutate()}
            disabled={promote.isPending || Boolean(current?.projectId)}
          >
            {current?.projectId ? 'Already promoted' : 'Promote to project'}
          </button>
        </> : undefined
      }
    >
      {error && <div className="alert error">{error}</div>}
      {request.isError && <div className="alert error">{errorMessage(request.error)}</div>}
      {request.isLoading ? (
        <p className="muted">Loading…</p>
      ) : current && (
        <>
        <section className="card opportunity-workflow" aria-label="Opportunity workflow" data-collapsed={workflowCollapsed}>
          <div className="opportunity-workflow-heading">
            {!workflowCollapsed && <h2>Workflow</h2>}
            {!workflowCollapsed && <span>{activeStage === -1 ? `Phase: ${current.phase}` : `Stage ${activeStage + 1} of ${REQUEST_WORKFLOW.length}: ${REQUEST_WORKFLOW[activeStage].title}`}</span>}
            <button type="button" className="workload-collapse-button" onClick={() => setWorkflowCollapsed((value) => !value)} aria-expanded={!workflowCollapsed} aria-controls="opportunity-workflow-steps" aria-label={workflowCollapsed ? 'Expand workflow' : 'Collapse workflow'} title={workflowCollapsed ? 'Expand workflow' : 'Collapse workflow'}>
              <span className={workflowCollapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
            </button>
          </div>
          <ol className="opportunity-workflow-steps" id="opportunity-workflow-steps">
            {REQUEST_WORKFLOW.map((step, index) => {
              const complete = index < activeStage || (index === activeStage && step.phase === 'Processed');
              const completedAt = current.workflowCompletedAt?.[step.phase];
              return <li key={step.phase} className={index === activeStage ? 'current' : complete ? 'complete' : 'upcoming'} aria-current={index === activeStage ? 'step' : undefined}>
                <span className="opportunity-workflow-number" aria-label={complete ? 'Completed' : undefined}>{complete ? '✓' : index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                  {complete && <span className="opportunity-workflow-completed">{completedAt ? `Completed ${new Date(completedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Date not recorded'}</span>}
                </div>
              </li>;
            })}
          </ol>
        </section>
        {!editable && <p className="muted">{current.phase && current.phase !== 'Draft' && current.phase !== 'Prioritization'
          ? 'This opportunity is read-only after prioritization.'
          : 'You can view this opportunity. Only its owner, sponsor, delegate, intake moderator or an admin can edit it.'}</p>}
        <form className="card" onSubmit={handleSubmit} key={current?.id ?? 'edit'}>
          <fieldset className="opportunity-fields" disabled={!editable}>
          <div className="field">
            <label htmlFor="shortTitle">Short Title</label>
            <input id="shortTitle" name="shortTitle" required minLength={3} maxLength={100} defaultValue={current?.shortTitle ?? ''} />
          </div>

          <div className="grid cols-2 opportunity-date-row">
            <div className="field">
              <label htmlFor="neededBy">Needed By</label>
              <input id="neededBy" name="neededBy" type="date" required defaultValue={current?.neededBy?.slice(0, 10) ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="neededByJustification">Rationale</label>
              <textarea id="neededByJustification" name="neededByJustification" required maxLength={4000} defaultValue={current?.neededByJustification ?? ''} />
            </div>
          </div>

          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="siteId">Site</label>
            <select id="siteId" name="siteId" defaultValue={current?.siteId ?? ''}>
              <option value="">Unassigned</option>
              {sites.data?.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </div>

          <div className="field">
            <LocationChipPicker id="location" name="location" defaultValue={current?.location ?? ''} required />
          </div>

          <div className="grid cols-2">
            <fieldset className="opportunity-fields" disabled={!canAssignDelegate}>
              <UserSelect id="sponsorPersonId" name="sponsorPersonId" label="Proposed Sponsor" personValue required defaultValue={current?.sponsorPersonId} />
            </fieldset>
            <fieldset className="opportunity-fields" disabled={!canAssignDelegate}>
              <UserSelect id="delegatePersonId" name="delegatePersonId" label="Who else should be able to make changes to this opportunity?" personValue defaultValue={current?.delegatePersonId} />
            </fieldset>
          </div>

          <div className="field">
            <label htmlFor="currentState">Current State</label>
            <textarea id="currentState" name="currentState" required minLength={10} maxLength={4000} defaultValue={current?.currentState ?? ''} />
          </div>

          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="discoveryMethod">Discovery Method</label>
              <textarea
                id="discoveryMethod"
                name="discoveryMethod"
                required
                maxLength={4000}
                defaultValue={current?.discoveryMethod ?? ''}
              />
            </div>
            <div className="field">
              <label htmlFor="impactToOperations">Impact to Operations</label>
              <textarea
                id="impactToOperations"
                name="impactToOperations"
                required
                maxLength={4000}
                defaultValue={current?.impactToOperations ?? ''}
              />
            </div>
          </div>

          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="desiredFutureState">Desired Future State</label>
              <textarea
                id="desiredFutureState"
                name="desiredFutureState"
                required
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
          </div>

          {moderator && <section className="opportunity-review-fields" aria-label="Intake review">
            <h2>Intake review</h2>
            <div className="grid cols-2">
              <div className="field">
                <label htmlFor="phase">Phase</label>
                <select id="phase" name="phase" defaultValue={current?.phase ?? DEFAULT_REQUEST_PHASE}>
                  {current?.phase && !REQUEST_PHASES.some((phase) => phase === current.phase) && <option value={current.phase}>{current.phase}</option>}
                  {REQUEST_PHASES.map((phase) => (
                    <option key={phase} value={phase}>
                      {REQUEST_WORKFLOW.find((step) => step.phase === phase)?.title}
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
            </div>
          </section>}

          </fieldset>
          <div className="row-actions">
            {editable && <button type="submit" value="draft" formNoValidate disabled={save.isPending}>
              {save.isPending ? 'Saving…' : isDraft ? 'Save as Draft' : 'Save changes'}
            </button>}
            {editable && isDraft && <button className="accent-button" type="submit" value="submit" disabled={save.isPending}>Submit Opportunity</button>}
            <button type="button" onClick={() => navigate(backTo)}>
              {editable ? 'Cancel' : 'Back to opportunities'}
            </button>
          </div>
        </form>
        </>
      )}
    </AccentSection>
  );
}
