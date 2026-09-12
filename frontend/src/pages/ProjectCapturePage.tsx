import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { departmentsApi, errorMessage, prioritizationApi, requestsApi } from '../api/client';

/** Project capture form: problem statement first, questionnaire second. */
export default function ProjectCapturePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const categories = useQuery({ queryKey: ['categories'], queryFn: prioritizationApi.categories });

  const submit = useMutation({
    mutationFn: (body: Parameters<typeof requestsApi.create>[0]) => requestsApi.create(body),
    onSuccess: (result) => setCreatedId(result.id),
    onError: (err) => setError(errorMessage(err)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    submit.mutate({
      title: String(form.get('title')),
      problemStatement: String(form.get('problemStatement')),
      businessCase: String(form.get('businessCase') || '') || undefined,
      expectedBenefit: String(form.get('expectedBenefit') || '') || undefined,
      departmentId: String(form.get('departmentId') || '') || undefined,
      categoryId: String(form.get('categoryId') || '') || undefined,
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
      <h1 className="page-title">New project request</h1>
      <p className="page-subtitle">Describe the problem before proposing a solution.</p>

      {error && <div className="alert error">{error}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="title">Request title</label>
          <input id="title" name="title" required minLength={3} maxLength={200} />
        </div>

        <div className="field">
          <label htmlFor="problemStatement">
            Problem statement — what is broken today, who does it affect, and what is the impact?
          </label>
          <textarea id="problemStatement" name="problemStatement" required minLength={10} maxLength={4000} />
        </div>

        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="businessCase">Business case</label>
            <textarea id="businessCase" name="businessCase" maxLength={4000} />
          </div>
          <div className="field">
            <label htmlFor="expectedBenefit">Expected benefit</label>
            <textarea id="expectedBenefit" name="expectedBenefit" maxLength={4000} />
          </div>
        </div>

        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="departmentId">Requesting department</label>
            <select id="departmentId" name="departmentId">
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
            <select id="categoryId" name="categoryId">
              <option value="">—</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
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
