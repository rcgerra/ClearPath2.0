import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { errorMessage, requestsApi } from '../api/client';
import UserSelect from '../components/admin/UserSelect';
import LocationChipPicker from '../components/LocationChipPicker';

/** Intake capture form: problem statement first, questionnaire second. Fields mirror the "New Business Case" form. */
export default function ProjectCapturePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (body: Parameters<typeof requestsApi.create>[0]) => requestsApi.create(body),
    onSuccess: (result) => setCreatedId(result.id),
    onError: (err) => setError(errorMessage(err)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const optional = (key: string) => String(form.get(key) || '').trim() || undefined;
    submit.mutate({
      title: String(form.get('shortTitle')),
      shortTitle: String(form.get('shortTitle')),
      sponsorPersonId: optional('sponsorPersonId'),
      location: optional('location'),
      neededBy: optional('neededBy'),
      neededByJustification: optional('neededByJustification'),
      currentState: String(form.get('currentState')),
      discoveryMethod: optional('discoveryMethod'),
      impactToOperations: optional('impactToOperations'),
      desiredFutureState: optional('desiredFutureState'),
      additionalInformation: optional('additionalInformation'),
    });
  }

  if (createdId) {
    return (
      <div className="card">
        <h2>Request submitted</h2>
        <p className="muted">
          Your request has been captured. Complete the prioritization questionnaire so it can be scored and ranked.
        </p>
        <div className="row-actions">
          <button className="primary" onClick={() => navigate(`/prioritization?requestId=${createdId}`)}>
            Start questionnaire
          </button>
          <button onClick={() => setCreatedId(null)}>Submit another request</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">New Business Case</h1>
      <p className="page-subtitle">Describe the problem before proposing a solution.</p>

      {error && <div className="alert error">{error}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="shortTitle">Short Title</label>
            <input id="shortTitle" name="shortTitle" required minLength={3} maxLength={100} />
          </div>
          <UserSelect id="sponsorPersonId" name="sponsorPersonId" label="Proposed Sponsor" personValue />
        </div>

        <div className="field">
          <LocationChipPicker id="location" name="location" />
        </div>

        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="neededBy">Needed By</label>
            <input id="neededBy" name="neededBy" type="date" />
          </div>
          <div className="field">
            <label htmlFor="neededByJustification">Rationale</label>
            <textarea
              id="neededByJustification"
              name="neededByJustification"
              maxLength={4000}
              placeholder="Explain why the project must be done by this date and the impact if delayed (e.g., production loss, compliance risk, missed opportunity)."
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="currentState">Current State</label>
          <textarea
            id="currentState"
            name="currentState"
            required
            minLength={10}
            maxLength={4000}
            placeholder="Describe the current situation or problem. What isn't working as expected? Include details about the issue or opportunity you want to address and why it matters."
          />
        </div>

        <div className="field">
          <label htmlFor="discoveryMethod">Discovery Method</label>
          <textarea
            id="discoveryMethod"
            name="discoveryMethod"
            maxLength={4000}
            placeholder="Explain how this issue or opportunity was identified. Examples include: cGMP audit, internal audit, GEMBA walkthrough, surveys, or other observations."
          />
        </div>

        <div className="field">
          <label htmlFor="impactToOperations">Impact to Operations</label>
          <textarea
            id="impactToOperations"
            name="impactToOperations"
            maxLength={4000}
            placeholder="Describe the effect this issue/opportunity is having. Include measurable outcomes where possible, such as value lost or gained, number of incidents, frequency, downtime, or other quantifiable impacts."
          />
        </div>

        <div className="field">
          <label htmlFor="desiredFutureState">Desired Future State</label>
          <textarea
            id="desiredFutureState"
            name="desiredFutureState"
            maxLength={4000}
            placeholder="Describe the goal you want to achieve. How much of the problem do you expect to resolve? What specifically will change or improve?"
          />
        </div>

        <div className="field">
          <label htmlFor="additionalInformation">Additional Information</label>
          <textarea
            id="additionalInformation"
            name="additionalInformation"
            maxLength={4000}
            placeholder="Include any other relevant details or context that would help reviewers understand the situation or your proposed solution."
          />
        </div>

        <div className="row-actions">
          <button className="primary" type="submit" disabled={submit.isPending}>
            {submit.isPending ? 'Submitting…' : 'Submit request'}
          </button>
          <button type="button" onClick={() => navigate(-1)} disabled={submit.isPending}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
