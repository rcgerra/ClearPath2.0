import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, prioritizationApi } from '../api/client';
import DataTable, { Column } from '../components/admin/DataTable';
import ListToolbar from '../components/admin/ListToolbar';
import PrioritizationAnalytics from '../components/PrioritizationAnalytics';
import { workflowStageIndex } from '../constants/phases';
import { useAuthStore } from '../store/authStore';
import { isMine, type OwnershipScope } from '../utils/ownership';
import type { ProjectRequest } from '../types';

type Rating = 0 | 1 | 5 | 10 | 15;
type DraftAnswer = { score?: Rating; justification: string; methodology: string };
const CLOSED_DISPOSITIONS = new Set(['Cancelled', 'Not Endorsed']);

function prioritizationStatus(request: ProjectRequest): string {
  if (workflowStageIndex(request.phase) > 1 || CLOSED_DISPOSITIONS.has(request.disposition ?? '')) return 'Closed';
  return request.prioritizationComplete ? 'Completed' : 'Needs prioritization';
}

export default function PrioritizationPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.roles.includes('admin');
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('requestId') ?? '';
  const analyticsView = Boolean(isAdmin) && searchParams.get('view') === 'analytics';
  const [queueSearch, setQueueSearch] = useState('');
  const [scope, setScope] = useState<OwnershipScope>(user?.personId || user?.email ? 'mine' : 'all');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ quartile: string; topTen: boolean } | null>(null);
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>({});
  const requests = useQuery({ queryKey: ['sponsored-requests'], queryFn: prioritizationApi.requests });
  const questions = useQuery({ queryKey: ['questions'], queryFn: () => prioritizationApi.questions() });
  const categories = useQuery({ queryKey: ['scoring-categories'], queryFn: prioritizationApi.categories });
  const existing = useQuery({ queryKey: ['answers', requestId], queryFn: () => prioritizationApi.answers(requestId), enabled: Boolean(requestId) });

  useEffect(() => {
    if (!existing.data || !questions.data) return;
    const requiredQuestionIds = new Set((questions.data ?? []).filter((question) => question.required).map((question) => question.id));
    const existingByQuestion = new Map(existing.data.map((answer) => [answer.questionId, answer]));
    setAnswers(Object.fromEntries(questions.data.map((question) => {
      const answer = existingByQuestion.get(question.id);
      const score = answer?.score === 0 && requiredQuestionIds.has(question.id)
        ? undefined
        : answer?.score as Rating | undefined ?? (question.required ? undefined : 0);
      return [question.id, {
        score,
        justification: answer?.justification ?? answer?.comment ?? '',
        methodology: answer?.methodology ?? '',
      }];
    })));
  }, [existing.data, questions.data]);

  const submit = useMutation({
    mutationFn: () => prioritizationApi.submit(requestId, (questions.data ?? []).map((question) => ({
      questionId: question.id,
      score: answers[question.id].score as Rating,
      justification: answers[question.id].justification.trim(),
      methodology: answers[question.id].methodology.trim() || undefined,
    }))),
    onSuccess: (response) => {
      setResult(response);
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const setAnswer = (questionId: string, changes: Partial<DraftAnswer>) => {
    setAnswers((current) => {
      const previous = current[questionId] ?? { justification: '', methodology: '' };
      return { ...current, [questionId]: { ...previous, ...changes } };
    });
  };

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    if (!requestId) return setError('Select a sponsored opportunity first.');
    const incomplete = (questions.data ?? []).find((question) => {
      const answer = answers[question.id];
      return answer?.score === undefined || (answer.score !== 0 && !answer.justification.trim());
    });
    if (incomplete) return setError(`Complete the rating and strategy for “${incomplete.text}”.`);
    submit.mutate();
  }

  const categoryGroups = (['Impact', 'Complexity'] as const).flatMap((parent) =>
    (categories.data ?? [])
      .filter((category) => category.parent === parent && category.isActive !== false)
      .map((category) => ({
        ...category,
        questions: (questions.data ?? [])
          .filter((question) => question.categoryId?.toLowerCase() === category.id.toLowerCase())
          .sort((left, right) => Number(right.required) - Number(left.required)),
      }))
      .filter((category) => category.questions.length),
  ).sort((left, right) => Number(right.questions.some((question) => question.required)) - Number(left.questions.some((question) => question.required)));
  const selectedRequest = requests.data?.find((request) => request.id === requestId);
  const moderator = Boolean(user?.roles.some((role) => role === 'admin' || role === 'intake_moderator'));
  const isSponsor = (request: ProjectRequest) => Boolean(user?.personId && request.sponsorPersonId?.toLowerCase() === user.personId.toLowerCase());
  const locked = Boolean(selectedRequest && ((!moderator && !isSponsor(selectedRequest)) || workflowStageIndex(selectedRequest.phase) > 1 && !moderator));
  const queueRows = (requests.data ?? []).filter((request) =>
    (scope === 'all' || isMine(request, user?.personId) || Boolean(user?.email && request.delegatePersonId?.toLowerCase() === user.email.toLowerCase()))
    && (!hideCompleted || prioritizationStatus(request) === 'Needs prioritization'));
  const requestColumns: Column<ProjectRequest>[] = [
    {
      key: 'request',
      label: 'Opportunity',
      value: (request) => request.shortTitle ?? request.title ?? request.name,
      render: (request) => <strong>{request.shortTitle ?? request.title ?? request.name}</strong>,
    },
    { key: 'spotId', label: 'SPOT ID', width: '110px', value: (request) => request.spotId },
    { key: 'sponsor', label: 'Sponsor', value: (request) => request.sponsorName ?? '—' },
    {
      key: 'status',
      label: 'Status',
      value: prioritizationStatus,
      render: (request) => <span className={`prioritization-status prioritization-status-${prioritizationStatus(request).toLowerCase().replaceAll(' ', '-')}`}>{prioritizationStatus(request)}</span>,
    },
    {
      key: 'action',
      label: 'Action',
      value: (request) => moderator || isSponsor(request) ? request.prioritizationComplete ? 'Review' : 'Prioritize' : 'View',
      render: (request) => moderator || isSponsor(request)
        ? <Link className="table-action-link" to={`/prioritization?requestId=${request.id}`}>{request.prioritizationComplete ? 'Review assessment' : 'Start assessment'}</Link>
        : <Link className="table-action-link" to={`/requests/${request.id}`}>View opportunity</Link>,
    },
  ];

  if (!requestId) {
    return <main className="prioritization-page accent-prioritization prioritization-list-page">
      <header className="prioritization-header prioritization-list-header">
        <div><h1 className="page-title">Prioritization</h1><p className="page-subtitle">Assess sponsored opportunities, review completed prioritizations, and keep the decision queue moving.</p></div>
        <div className="prioritization-list-actions">
          <nav className="prioritization-tabs" aria-label="Prioritization views">
            <Link className={!analyticsView ? 'active' : ''} to="/prioritization" aria-current={!analyticsView ? 'page' : undefined}>Queue</Link>
            {isAdmin && <Link className={analyticsView ? 'active' : ''} to="/prioritization?view=analytics" aria-current={analyticsView ? 'page' : undefined}>Analytics</Link>}
          </nav>
        </div>
      </header>
      {requests.isError && <div className="alert error">{errorMessage(requests.error)}</div>}
      {analyticsView ? <PrioritizationAnalytics /> : <section className="prioritization-table-section">
        <p className="prioritization-queue-label">{hideCompleted ? 'Open opportunities' : 'All opportunities'}</p>
        <div className="card table-card prioritization-table-card"><DataTable rows={queueRows} columns={requestColumns} getRowKey={(request) => request.id} search={queueSearch} initialSortKey="status" isLoading={requests.isLoading} emptyMessage={queueSearch.trim() ? 'No opportunities match the current search.' : 'No opportunities match the current filters.'} /></div>
        <ListToolbar search={queueSearch} onSearch={setQueueSearch} placeholder="Search opportunities, SPOT IDs or sponsors…" scope={{ value: scope, onChange: setScope, disabled: !user?.personId && !user?.email }} toggles={[{ label: 'Hide completed and closed', checked: hideCompleted, onChange: setHideCompleted }]} />
      </section>}
    </main>;
  }

  return (
    <main className="prioritization-page accent-prioritization">
      <header className="prioritization-header">
        <div><Link className="prioritization-cancel-button" to="/prioritization">← Cancel and return to list</Link><p className="eyebrow">Sponsor assessment</p><h1 className="page-title">Prioritize the opportunity</h1><p className="page-subtitle">Choose the best-supported response, then state the strategy for realizing it.</p></div>
      </header>
      {selectedRequest && <div className="prioritization-project-strip"><strong>{selectedRequest.shortTitle ?? selectedRequest.title}</strong><span>{selectedRequest.sponsorName ?? 'Sponsor'}</span></div>}
      {locked && <p className="muted">This assessment is read-only after prioritization.</p>}
      {error && <div className="alert error">{error}</div>}
      {result && <div className="prioritization-result" role="status"><strong>{result.quartile}</strong><span>{result.topTen ? 'Currently a top 10 opportunity' : 'Assessment saved'}</span></div>}
      <form onSubmit={handleSubmit}>
        <fieldset className="opportunity-fields" disabled={locked}>
        {categoryGroups.map((category) => <div className="prioritization-category" key={category.id}>
          <div className="category-heading"><h3>{category.name}</h3></div>
          {category.questions.map((question, questionIndex) => {
            const answer = answers[question.id] ?? { justification: '', methodology: '' };
            const options = question.required ? question.options.filter((option) => option.score !== 0) : question.options;
            return <article className="question-panel" key={question.id}>
              <div className="question-copy"><span className="question-number">{String(questionIndex + 1).padStart(2, '0')}</span><div><h4>{question.text} {question.required && <span className="required-marker">Required</span>}</h4>{question.subtitle && <p>{question.subtitle}</p>}</div></div>
              <div className={`rating-options rating-options-${options.length}`} role="radiogroup" aria-label={question.text}>{options.map((option) => <label className={`rating-option ${answer.score === option.score ? 'selected' : ''}`} key={option.score}><input type="radio" name={`score-${question.id}`} value={option.score} checked={answer.score === option.score} onChange={() => setAnswer(question.id, { score: option.score })} /><span className="rating-mark" aria-hidden="true">{option.score === 0 ? <span>—</span> : Array.from({ length: [1, 5, 10, 15].indexOf(option.score) + 1 }, (_, index) => <span key={index}>★</span>)}</span><small>{option.text}</small></label>)}</div>
              {answer.score !== undefined && answer.score !== 0 && <div className="answer-evidence"><label>Strategy / justification <span>Required</span><textarea value={answer.justification} onChange={(event) => setAnswer(question.id, { justification: event.target.value })} placeholder="How will this outcome be realized?" rows={2} /></label><details><summary>Calculation methodology <span>Optional</span></summary><textarea value={answer.methodology} onChange={(event) => setAnswer(question.id, { methodology: event.target.value })} placeholder="Inputs, assumptions, formula, or source" rows={2} /></details></div>}
            </article>;
          })}
        </div>)}
        <div className="prioritization-submit"><span>{Object.values(answers).filter((answer) => answer.score !== undefined && answer.justification.trim()).length} of {questions.data?.length ?? 0} complete</span>{!locked && <button className="primary" type="submit" disabled={!requestId || submit.isPending}>{submit.isPending ? 'Saving assessment…' : 'Submit prioritization'}</button>}</div>
        </fieldset>
      </form>
    </main>
  );
}