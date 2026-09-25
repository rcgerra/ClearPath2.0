import { useId, useMemo, useState } from 'react';
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
  /** Skip the built-in title/collapse toolbar when the page already shows this information in its own header. */
  hideHeader?: boolean;
  collapsible?: boolean;
}

/** Assigned skills for a person, grouped by category, shown as bubbles you click to assign/unassign when `canEdit` is true. */
export default function SkillsCard({ personId, canEdit, title = 'Skills', subtitle, hideHeader = false, collapsible = true }: Props) {
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

  /** Unassigned, active skills for the "click to add" bubble picker, grouped by category. */
  const groupedAvailable = useMemo(() => {
    const map = new Map<string, { categoryName: string; rows: typeof allSkills.data }>();
    for (const skill of allSkills.data ?? []) {
      if (!skill.isActive || assignedIds.has(skill.id)) continue;
      const bucket = map.get(skill.categoryId) ?? { categoryName: skill.categoryName, rows: [] };
      bucket.rows = [...(bucket.rows ?? []), skill];
      map.set(skill.categoryId, bucket);
    }
    return [...map.entries()]
      .map(([categoryId, bucket]) => ({ categoryId, ...bucket }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [allSkills.data, assignedIds]);

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

  const addAction = canEdit && (
    <button
      type="button"
      className="icon-button icon-button-add icon-button-add-labeled"
      aria-expanded={adding}
      onClick={() => setAdding((value) => !value)}
    >
      <span aria-hidden="true">+</span>
      <span>{adding ? 'Done adding' : 'Add skill'}</span>
    </button>
  );

  const content = (
    <>
      {subtitle && <p className="muted">{subtitle}</p>}
      {error && <div className="alert error">{error}</div>}

      {adding && canEdit && (
        <div className="skills-picker">
          <p className="muted">Click a skill to add it to your profile.</p>
          {allSkills.isLoading ? (
            <p className="muted">Loading skills…</p>
          ) : groupedAvailable.length === 0 ? (
            <p className="muted">All active skills are already assigned.</p>
          ) : (
            <div className="category-subcategories-editor">
              {groupedAvailable.map((category) => (
                <div key={category.categoryId} className="subcategory-list" style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ marginRight: '0.5rem' }}>{category.categoryName}:</strong>
                  {(category.rows ?? []).map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      className="subcategory-chip subcategory-chip-add"
                      disabled={assignSkill.isPending}
                      onClick={() => assignSkill.mutate(skill.id)}
                    >
                      + {skill.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
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
              {(category.rows ?? []).map((row) =>
                canEdit ? (
                  <button
                    key={row.id}
                    type="button"
                    className="subcategory-chip subcategory-chip-assigned"
                    disabled={removeSkill.isPending}
                    aria-label={`Remove ${row.skillName}`}
                    title={`Click to remove ${row.skillName}`}
                    onClick={() => removeSkill.mutate(row.skillId)}
                  >
                    {row.skillName} <span aria-hidden="true">×</span>
                  </button>
                ) : (
                  <span key={row.id} className="subcategory-chip">{row.skillName}</span>
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (hideHeader) {
    return (
      <div className="card skills-card skills-card-plain">
        {(canManageRepository || addAction) && (
          <div className="row-actions skills-simple-actions">
            {canManageRepository && <Link to="/skills" className="skills-repository-link">Manage skill repository</Link>}
            {addAction}
          </div>
        )}
        {content}
      </div>
    );
  }

  return (
    <div className="card skills-card">
      <div className="toolbar skills-header">
        <h2 style={{ margin: 0, flex: 1 }}>{title}</h2>
        {canManageRepository && <Link to="/skills" className="skills-repository-link">Manage skill repository</Link>}
        {addAction}
        {collapsible && (
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
        )}
      </div>
      <div id={contentId} hidden={collapsed}>
        {content}
      </div>
    </div>
  );
}

