import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, prioritizationApi, requestsApi } from '../api/client';

export default function PrioritizationPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestId = searchParams.get('requestId') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const requests = useQuery({ queryKey: ['requests'], queryFn: () => requestsApi.list() });
  const questions = useQuery({ queryKey: ['questions'], queryFn: prioritizationApi.questions });
  const ranking = useQuery({ queryKey: ['ranking'], queryFn: prioritizationApi.ranking });
  const existing = useQuery({
    queryKey: ['answers', requestId],
    queryFn: () => prioritizationApi.answers(requestId),
    enabled: Boolean(requestId),
  });

  useEffect(() => {
    if (!existing.data) return;
    setAnswers(
      Object.fromEntries(existing.data.map((answer) => [answer.questionId, String(answer.score ?? answer.value ?? '')])),
    );
  }, [existing.data]);

  const submit = useMutation({
    mutationFn: () =>
      prioritizationApi.submit(
        requestId,
        Object.entries(answers).map(([questionId, value]) => ({ questionId, value: Number(value) || 0 })),
      ),
    onSuccess: (result) => {
      setScore(result.priorityScore);
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!requestId) {
      setError('Select a request first.');
      return;
    }
    submit.mutate();
  }

  return (
    <>
      <h1 className="page-title">Prioritization</h1>
      <p className="page-subtitle">Weighted questionnaire scoring drives the ranked backlog.</p>

      {error && <div className="alert error">{error}</div>}
      {score !== null && <div className="alert success">Priority score saved: {score}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="field" style={{ maxWidth: 520 }}>
          <label htmlFor="requestId">Request</label>
          <select
            id="requestId"
            value={requestId}
            onChange={(event) => {
              setScore(null);
              setAnswers({});
              setSearchParams(event.target.value ? { requestId: event.target.value } : {});
            }}
          >
            <option value="">Select…</option>
            {requests.data?.map((request) => (
              <option key={request.id} value={request.id}>
                {request.title ?? request.name}
              </option>
            ))}
          </select>
        </div>

        {questions.data?.length ? (
          questions.data.map((question) => (
            <div className="field" key={question.id}>
              <label htmlFor={`q-${question.id}`}>
                {question.text}{' '}
                <span className="badge">
                  {question.categoryName ?? 'General'} · weight {question.weight}
                </span>
              </label>
              <input
                id={`q-${question.id}`}
                type="number"
                min={0}
                max={100}
                value={answers[question.id] ?? ''}
                onChange={(event) => setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))}
                placeholder="0-100"
              />
            </div>
          ))
        ) : (
          <p className="muted">No active questions found in _Questions.</p>
        )}

        <button className="primary" type="submit" disabled={!requestId || submit.isPending}>
          {submit.isPending ? 'Scoring…' : 'Save answers and score'}
        </button>
      </form>

      <div className="card">
        <h2>Ranked backlog</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Request</th>
              <th>Category</th>
              <th>Department</th>
              <th>Status</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {ranking.data?.map((row) => (
              <tr key={row.id}>
                <td>{row.rank}</td>
                <td>{row.title}</td>
                <td>{row.categoryName ?? '—'}</td>
                <td>{row.departmentName ?? '—'}</td>
                <td>
                  <span className="badge">{row.status ?? '—'}</span>
                </td>
                <td>
                  <strong>{row.priorityScore ?? 0}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
