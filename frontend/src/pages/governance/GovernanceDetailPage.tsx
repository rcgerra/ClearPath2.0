import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, governanceApi, lookupsApi, peopleApi, prioritizationApi } from '../../api/client';
import PrioritizationRangeBar, { PrioritizationStanding } from '../../components/PrioritizationRangeBar';
import SlideOverPanel from '../../components/SlideOverPanel';
import { formatDate } from '../../utils/dates';
import {
  GOVERNANCE_COMPLETE_PHASE,
  SG1_DISPOSITIONS,
  type GovernanceItem,
} from '../../types';
type CommentKey = 'dqComment' | 'pirtComment' | 'sg1Comment' | 'creationComment';

const COMMENT_FIELDS: Record<string, { key: CommentKey; label: string }> = {
  'DQ Check': { key: 'dqComment', label: 'DQ Check comment' },
  'PIRT Assessment': { key: 'pirtComment', label: 'PIRT Assessment comment' },
  'SG1 Review': { key: 'sg1Comment', label: 'Stage Gate 1 comment' },
  Configuration: { key: 'creationComment', label: 'Project Creation comment' },
  Processed: { key: 'creationComment', label: 'Project Creation comment' },
};

/** Prioritization answers are scored 0/1/5/10/15; show them as a four-star rating. */
function AnswerStars({ score }: { score?: number }) {
  const filled = [0, 1, 5, 10, 15].indexOf(score ?? -1);
  if (filled < 0) return <span className="priority-rank-stars" aria-label="Not answered">—</span>;
  return (
    <span className="priority-rank-stars" aria-label={`Score ${score} of 15`}>
      {[1, 2, 3, 4].map((position) => (
        <span key={position} className={position <= filled ? 'is-filled' : ''} aria-hidden="true">★</span>
      ))}
    </span>
  );
}

function advanceLabel(phase?: string): string {  switch (phase) {
    case 'DQ Check': return 'Advance to PIRT Assessment';
    case 'PIRT Assessment': return 'Advance to SG1 Review';
    case 'SG1 Review': return 'Advance to Project Creation';
    case 'Configuration': return 'Mark governance complete';
    default: return 'Advance';
  }
}

export default function GovernanceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<CommentKey, string>>({
    dqComment: '', pirtComment: '', sg1Comment: '', creationComment: '',
  });
  const [managerPersonId, setManagerPersonId] = useState('');
  const [sponsorPersonId, setSponsorPersonId] = useState('');
  const [spotId, setSpotId] = useState('');
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);

  const item = useQuery({ queryKey: ['governance', id], queryFn: () => governanceApi.get(id), enabled: Boolean(id) });
  const programs = useQuery({ queryKey: ['lookups', 'programs'], queryFn: () => lookupsApi.list('programs') });
  const projectTypes = useQuery({ queryKey: ['governance', 'project-types'], queryFn: governanceApi.projectTypes });
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });
  const questions = useQuery({ queryKey: ['prioritization', 'questions'], queryFn: () => prioritizationApi.questions() });
  const answers = useQuery({ queryKey: ['prioritization', 'answers', id], queryFn: () => prioritizationApi.answers(id) });
  const ranking = useQuery({ queryKey: ['prioritization', 'ranking'], queryFn: prioritizationApi.ranking });
  const allItems = useQuery({ queryKey: ['governance'], queryFn: governanceApi.list });

  const record = item.data;

  useEffect(() => {
    if (!record) return;
    setComments({
      dqComment: record.dqComment ?? '',
      pirtComment: record.pirtComment ?? '',
      sg1Comment: record.sg1Comment ?? '',
      creationComment: record.creationComment ?? '',
    });
    setSpotId(record.spotId ?? '');
    setManagerPersonId((current) => current || record.requesterPersonId || '');
    setSponsorPersonId((current) => current || record.sponsorPersonId || '');
  }, [record]);

  function refresh(updated?: GovernanceItem) {
    setError(null);
    if (updated) queryClient.setQueryData(['governance', id], updated);
    queryClient.invalidateQueries({ queryKey: ['governance'] });
  }

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => governanceApi.update(id, body),
    onSuccess: refresh,
    onError: (cause) => setError(errorMessage(cause)),
  });
  const advance = useMutation({
    mutationFn: () => governanceApi.advance(id),
    onSuccess: refresh,
    onError: (cause) => setError(errorMessage(cause)),
  });
  const createStaffingPlan = useMutation({
    mutationFn: () => governanceApi.createStaffingPlan(id, { managerPersonId, sponsorPersonId }),
    onSuccess: (result) => refresh(result.item),
    onError: (cause) => setError(errorMessage(cause)),
  });

  const answersByQuestion = useMemo(
    () => new Map((answers.data ?? []).map((answer) => [String(answer.questionId).toLowerCase(), answer])),
    [answers.data],
  );

  const standing = useMemo(() => {
    const ranked = ranking.data ?? [];
    if (!item.data || ranked.length === 0) return null;
    // The ranking endpoint already covers active requests only; inactive ones stay unranked.
    const mine = ranked.find((entry) => entry.id.toLowerCase() === id.toLowerCase());
    const score = mine?.priorityScore ?? item.data.priorityScore ?? 0;
    const scores = ranked.map((entry) => entry.priorityScore ?? 0);

    const programId = item.data.programId;
    const peers = programId
      ? (allItems.data ?? [])
        .filter((entry) => entry.isActive !== false && entry.programId?.toLowerCase() === programId.toLowerCase())
        .map((entry) => ({
          id: entry.id,
          score: ranked.find((row) => row.id.toLowerCase() === entry.id.toLowerCase())?.priorityScore
            ?? entry.priorityScore ?? 0,
        }))
      : [];
    const peerScores = peers.map((peer) => peer.score);
    const programName = programs.data?.find((program) => program.id.toLowerCase() === programId?.toLowerCase())?.name;
    const peerRank = peers.findIndex((peer) => peer.id.toLowerCase() === id.toLowerCase()) === -1
      ? null
      : [...peers].sort((left, right) => right.score - left.score)
        .findIndex((peer) => peer.id.toLowerCase() === id.toLowerCase()) + 1;

    return {
      score,
      quartile: mine?.quartile,
      topTen: Boolean(mine?.topTen),
      portfolio: {
        min: Math.min(...scores, score),
        max: Math.max(...scores, score),
        rank: mine?.rank ?? null,
        total: ranked.length,
        label: 'Portfolio',
      },
      program: peers.length > 1 ? {
        min: Math.min(...peerScores),
        max: Math.max(...peerScores),
        rank: peerRank,
        total: peers.length,
        label: programName ?? 'Program',
      } : null,
    };
  }, [allItems.data, id, item.data, programs.data, ranking.data]);

  if (item.isLoading) return <p className="muted" role="status">Loading governance item…</p>;
  if (!record) return <p className="muted">This governance item could not be found.</p>;

  const busy = update.isPending || advance.isPending || createStaffingPlan.isPending;
  const isComplete = record.phase === GOVERNANCE_COMPLETE_PHASE;
  const stageComment = COMMENT_FIELDS[record.phase ?? ''];
  const openQuestion = (questions.data ?? []).find((question) => question.id === openQuestionId);
  const openAnswer = openQuestion ? answersByQuestion.get(String(openQuestion.id).toLowerCase()) : undefined;
  const activePeople = (people.data ?? []).filter((person) => person.isActive !== false);

  return (
    <section className="accent-section accent-governance governance-detail">
      <div className="accent-section-header">
        <div className="page-header-row">
          <button type="button" className="back-button page-header-back-button" onClick={() => navigate(-1)} aria-label="Go back">←</button>
          <div>
            <h1 className="page-title">{record.shortTitle ?? record.title ?? 'Untitled opportunity'}</h1>
          </div>
        </div>
        <div className="governance-header-actions">
          <button
            type="button"
            className={`governance-cancel-button${record.cancelled ? ' is-cancelled' : ''}`}
            disabled={busy}
            onClick={() => update.mutate({ cancelled: !record.cancelled })}
            aria-label={record.cancelled ? 'Reinstate item' : 'Cancel item'}
            title={record.cancelled ? 'Reinstate item' : 'Cancel item'}
          >
            {record.cancelled ? '↺' : '⊘'}
          </button>
          {standing && (
            <PrioritizationStanding rank={standing.portfolio.rank} quartile={standing.quartile} topTen={standing.topTen} />
          )}
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="governance-detail-layout">
        <div className="governance-detail-main">
          <div className="card governance-detail-card">
            <h2>Project details</h2>
            <dl className="governance-definition-list">
              <dt>Submitted by</dt><dd>{record.requesterName ?? '—'}</dd>
              <dt>Sponsor</dt><dd>{record.sponsorName ?? '—'}</dd>
              <dt>Department</dt><dd>{record.departmentName ?? '—'}</dd>
              <dt>Submitted on</dt><dd>{record.submittedOn ? formatDate(record.submittedOn) : '—'}</dd>
              <dt>Needed by</dt><dd>{record.neededBy ?? '—'}</dd>
              <dt>SPOT ID</dt><dd>{record.spotId ?? '—'}</dd>
              <dt>Current state</dt><dd>{record.currentState ?? '—'}</dd>
              <dt>Desired future state</dt><dd>{record.desiredFutureState ?? '—'}</dd>
              <dt>Impact to operations</dt><dd>{record.impactToOperations ?? '—'}</dd>
              <dt>Additional information</dt><dd>{record.additionalInformation ?? '—'}</dd>
            </dl>
          </div>

          <div className="card governance-detail-card">
            <h2>Prioritization details</h2>
            {answers.isLoading || questions.isLoading ? <p className="muted">Loading assessment…</p> : (
              <div className="governance-score-list">
                {standing && (
                  <PrioritizationRangeBar
                    score={standing.score}
                    portfolio={standing.portfolio}
                    program={standing.program}
                  />
                )}
                {(questions.data ?? []).map((question) => {
                  const answer = answersByQuestion.get(String(question.id).toLowerCase());
                  return (
                    <button
                      type="button"
                      className="governance-score-row"
                      key={question.id}
                      onClick={() => setOpenQuestionId(question.id)}
                    >
                      <strong>{question.text}</strong>
                      <AnswerStars score={answer?.score} />
                      <p className="muted">{answer?.justification || 'No justification recorded.'}</p>
                    </button>
                  );
                })}
                {(questions.data ?? []).length === 0 && <p className="muted">No prioritization questions are configured.</p>}
              </div>
            )}
          </div>
        </div>

        <aside className="card governance-detail-actions">
          {record.phase === 'PIRT Assessment' && (
            <div className="governance-field-grid">
              <label>
                <span>Program</span>
                <select
                  value={record.programId ?? ''}
                  disabled={busy}
                  onChange={(event) => update.mutate({ programId: event.target.value || null })}
                >
                  <option value="">Not assigned</option>
                  {(programs.data ?? []).map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
                </select>
              </label>
              <label>
                <span>Project type</span>
                <select
                  value={record.projectType ?? ''}
                  disabled={busy}
                  onChange={(event) => update.mutate({ projectType: event.target.value || null })}
                >
                  <option value="">Not assigned</option>
                  {(projectTypes.data ?? []).map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}
                </select>
              </label>
            </div>
          )}

          {record.phase === 'SG1 Review' && (
            <div className="governance-field-grid">
              <label>
                <span>Disposition</span>
                <select
                  value={SG1_DISPOSITIONS.includes(record.disposition as never) ? record.disposition : ''}
                  disabled={busy}
                  onChange={(event) => event.target.value && update.mutate({ disposition: event.target.value })}
                >
                  <option value="">Not decided</option>
                  {SG1_DISPOSITIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
          )}

          {record.phase === 'Configuration' && (
            <div className="governance-checklist">
              <div className="governance-checklist-step">
                <h3>1 · Staffing plan</h3>
                {record.projectId ? (
                  <p>
                    Created. <Link className="record-link" to={`/projects/${record.projectId}`}>Open the staffing plan</Link>
                  </p>
                ) : (
                  <>
                    <div className="governance-field-grid">
                      <label>
                        <span>Project manager</span>
                        <select value={managerPersonId} onChange={(event) => setManagerPersonId(event.target.value)} disabled={busy}>
                          <option value="">Select a person</option>
                          {activePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Project sponsor</span>
                        <select value={sponsorPersonId} onChange={(event) => setSponsorPersonId(event.target.value)} disabled={busy}>
                          <option value="">Select a person</option>
                          {activePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || !managerPersonId || !sponsorPersonId}
                      onClick={() => createStaffingPlan.mutate()}
                    >
                      Create staffing plan
                    </button>
                  </>
                )}
              </div>

              <div className="governance-checklist-step">
                <h3>2 · Project fileshare</h3>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={Boolean(record.fileshareReady)}
                    disabled={busy}
                    onChange={(event) => update.mutate({ fileshareReady: event.target.checked })}
                  />
                  <span className="switch-track" aria-hidden="true" />
                  <span className="switch-label">Fileshare created</span>
                </label>
              </div>

              <div className="governance-checklist-step">
                <h3>3 · SPOT record</h3>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={Boolean(record.spotRecordCreated)}
                    disabled={busy}
                    onChange={(event) => update.mutate({ spotRecordCreated: event.target.checked })}
                  />
                  <span className="switch-track" aria-hidden="true" />
                  <span className="switch-label">SPOT record created</span>
                </label>
                <label>
                  <span>SPOT ID</span>
                  <input
                    value={spotId}
                    disabled={busy}
                    onChange={(event) => setSpotId(event.target.value)}
                    onBlur={() => spotId !== (record.spotId ?? '') && update.mutate({ spotId })}
                    placeholder="SPOT identifier"
                  />
                </label>
              </div>
            </div>
          )}

          {stageComment && (
            <div className="governance-comments">
              <label>
                <span>{stageComment.label}</span>
                <textarea
                  rows={3}
                  value={comments[stageComment.key]}
                  disabled={busy}
                  onChange={(event) => setComments((current) => ({ ...current, [stageComment.key]: event.target.value }))}
                  onBlur={() => comments[stageComment.key] !== (record[stageComment.key] ?? '')
                    && update.mutate({ [stageComment.key]: comments[stageComment.key] })}
                />
              </label>
            </div>
          )}

          {!isComplete && (
            <div className="governance-advance">
              {record.cancelled && <span className="muted">Reinstate this item before advancing it.</span>}
              <button type="button" className="primary" disabled={busy || Boolean(record.cancelled)} onClick={() => advance.mutate()}>
                {advanceLabel(record.phase)}
              </button>
            </div>
          )}
        </aside>
      </div>

      <SlideOverPanel
        open={Boolean(openQuestion)}
        onClose={() => setOpenQuestionId(null)}
        title="Prioritization answer"
        subtitle={openQuestion?.categoryName}
      >
        {openQuestion && (
          <div className="governance-answer-detail">
            <h3>{openQuestion.text}</h3>
            {openQuestion.subtitle && <p className="muted">{openQuestion.subtitle}</p>}

            <dl className="governance-definition-list">
              <dt>Score</dt>
              <dd><AnswerStars score={openAnswer?.score} /> {openAnswer?.score ?? '—'} of 15</dd>
              <dt>Rating</dt><dd>{openAnswer?.value ?? '—'}</dd>
              <dt>Category</dt><dd>{openQuestion.categoryName ?? '—'}</dd>
              <dt>Weight</dt><dd>{openQuestion.weight}</dd>
              <dt>Metric</dt><dd>{openQuestion.metric || '—'}</dd>
              <dt>Justification</dt><dd>{openAnswer?.justification || 'No justification recorded.'}</dd>
              <dt>Methodology</dt><dd>{openAnswer?.methodology || '—'}</dd>
            </dl>

            {openQuestion.helpText && (
              <>
                <h4>Guidance</h4>
                <p className="muted">{openQuestion.helpText}</p>
              </>
            )}

            <h4>Rating scale</h4>
            <ul className="governance-answer-options">
              {openQuestion.options.map((option) => (
                <li key={option.score} className={option.score === openAnswer?.score ? 'is-selected' : ''}>
                  <AnswerStars score={option.score} />
                  <span>{option.text || option.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SlideOverPanel>
    </section>
  );
}
