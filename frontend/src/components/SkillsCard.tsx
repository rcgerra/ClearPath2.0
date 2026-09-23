import { FormEvent, useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { errorMessage, skillsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { isAdmin } from '../utils/permissions';

interface Props {
  personId: string;
  canEdit: boolean;
  title?: string;
  subtitle?: string;
}

/** Assigned skills for a person, grouped by category, with add/remove when `canEdit` is true. */
export default function SkillsCard({ personId, canEdit, title = 'Skills', subtitle }: Props) {
  const contentId = useId();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManageRepository = isAdmin(useAuthStore((state) => state.user));

  const personSkills = useQuery({
    queryKey: ['skills', 'person', personId],
    queryFn: () => skillsApi.personSkills(personId),
    enabled: Boolean(personId),
  });
  const allSkills = useQuery({ queryKey: ['skills'], queryFn: () => skillsApi.list() });

  const assignSkill = useMutation({
    mutationFn: (skillId: string) => skillsApi.addPersonSkill(personId, skillId),
    onSuccess: () => {
      setError(null);
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ['skills', 'person', personId] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const removeSkill = useMutation({
    mutationFn: (skillId: string) => skillsApi.removePersonSkill(personId, skillId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills', 'person', personId] }),
    onError: (cause) => setError(errorMessage(cause)),
  });

  const assignedIds = useMemo(() => new Set((personSkills.data ?? []).map((row) => row.skillId)), [personSkills.data]);

  /** Unassigned, active skills for the "pick a skill" dropdown — just names, category is inferred. */
  const availableSkills = useMemo(
    () =>
      (allSkills.data ?? [])
        .filter((skill) => skill.isActive && !assignedIds.has(skill.id))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allSkills.data, assignedIds],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { categoryName: string; rows: typeof personSkills.data }>();
    for (const row of personSkills.data ?? []) {
      const bucket = map.get(row.categoryId) ?? { categoryName: row.categoryName, rows: [] };
      bucket.rows = [...(bucket.rows ?? []), row];
      map.set(row.categoryId, bucket);
    }
    return [...map.entries()]
      .map(([categoryId, bucket]) => ({ categoryId, ...bucket }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [personSkills.data]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const skillId = String(new FormData(event.currentTarget).get('skillId') || '');
    if (!skillId) {
      setError('Select a skill.');
      return;
    }
    assignSkill.mutate(skillId);
  }

  return (
    <div className="card skills-card">
      <div className="toolbar skills-header">
        <h2 style={{ margin: 0, flex: 1 }}>{title}</h2>
        {canManageRepository && <Link to="/skills" className="skills-repository-link">Manage skill repository</Link>}
        {canEdit && (
          <button
            type="button"
            className="icon-button icon-button-add icon-button-add-labeled"
            onClick={() => setAdding((value) => !value)}
          >
            <span aria-hidden="true">+</span>
            <span>Add skill</span>
          </button>
        )}
        <button
          type="button"
          className="workload-collapse-button"
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className={collapsed ? 'workload-collapse-chevron collapsed' : 'workload-collapse-chevron'} aria-hidden="true" />
        </button>
      </div>
      <div id={contentId} hidden={collapsed}>
        {subtitle && <p className="muted">{subtitle}</p>}
        {error && <div className="alert error">{error}</div>}

        {adding && canEdit && (
          <form className="toolbar assignment-picker" onSubmit={submit}>
            <div>
              <label htmlFor={`skillId-${personId}`}>Skill</label>
              <select id={`skillId-${personId}`} name="skillId" required defaultValue="">
                <option value="" disabled>
                  {allSkills.isLoading ? 'Loading skills…' : 'Select…'}
                </option>
                {availableSkills.map((skill) => (
                  <option key={skill.id} value={skill.id}>{skill.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="primary" disabled={assignSkill.isPending}>
              {assignSkill.isPending ? 'Adding…' : 'Add'}
            </button>
            <button type="button" onClick={() => setAdding(false)}>Cancel</button>
          </form>
        )}

        {personSkills.isLoading ? (
          <p className="muted">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="muted">No skills recorded yet.</p>
        ) : (
          <div className="category-subcategories-editor">
            {grouped.map((category) => (
              <div key={category.categoryId} className="subcategory-list" style={{ marginBottom: '0.5rem' }}>
                <strong style={{ marginRight: '0.5rem' }}>{category.categoryName}:</strong>
                {(category.rows ?? []).map((row) => (
                  <span key={row.id} className="subcategory-chip">
                    {row.skillName}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remove ${row.skillName}`}
                        title={`Remove ${row.skillName}`}
                        disabled={removeSkill.isPending}
                        onClick={() => removeSkill.mutate(row.skillId)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

