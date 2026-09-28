import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, departmentsApi, errorMessage, peopleApi, usersApi } from '../../api/client';
import AccentSection from '../../components/admin/AccentSection';
import SkillsCard from '../../components/SkillsCard';
import { useAuthStore } from '../../store/authStore';
import { canEditAvailability } from '../../utils/permissions';
import { useSiteAccess } from '../../utils/useSiteAccess';

const EMPLOYMENT_TYPES = ['FTE', 'Contractor'];

export default function PersonEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const inAdminPortal = useLocation().pathname.startsWith('/admin');
  const queryClient = useQueryClient();
  const { user: authUser, viewingAs, setSession, startViewingAs } = useAuthStore();
  const { site, sites, admin, canCreatePerson, loading } = useSiteAccess();
  const canEditSite = admin && inAdminPortal && !isNew;
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [directoryUserId, setDirectoryUserId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const person = useQuery({ queryKey: ['person', id], queryFn: () => peopleApi.get(id!), enabled: !isNew });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const current = person.data;
  const directory = useQuery({
    queryKey: ['users', isNew ? userSearch : current?.email],
    queryFn: () => usersApi.search(isNew ? userSearch : current!.email!),
    enabled: isNew ? userSearch.length > 2 : Boolean(current?.email),
  });


  useEffect(() => {
    setDepartmentId(current?.departmentId ?? '');
    setIsActive(current?.isActive !== false);
  }, [current?.id]);

  useEffect(() => {
    setSiteId(current?.siteId ?? site?.id ?? '');
  }, [current?.siteId, site?.id]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (isNew ? peopleApi.create(body) : peopleApi.update(id!, body)),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['person', id] });
      if (id && authUser && id === authUser.personId) {
        if (viewingAs) {
          const { viewAsToken, user: refreshedUser } = await authApi.viewAs(id);
          startViewingAs(viewAsToken, refreshedUser);
        } else {
          const { token, user: refreshedUser } = await authApi.session(authUser.userId);
          setSession(token, refreshedUser);
        }
        queryClient.clear();
      }
      navigate(inAdminPortal ? '/admin/people' : '/people');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const selectedDirectoryUser = directory.data?.find((entry) => entry.id === directoryUserId);
  const linkedDirectoryUser = !isNew && current?.email
    ? directory.data?.find((entry) => entry.email?.toLowerCase() === current.email?.toLowerCase()) : undefined;
  const selectedDepartment = departments.data?.find((dept) => dept.id === departmentId);
  const email = selectedDirectoryUser?.email ?? current?.email ?? '';
  const title = selectedDirectoryUser?.jobTitle ?? linkedDirectoryUser?.jobTitle ?? current?.title ?? '';
  const functionName = selectedDepartment?.functionName ?? 'Inferred from department';
  const canEditSkills = Boolean(current) && canEditAvailability(authUser, { personId: current?.id, department: selectedDepartment });
  const canEdit = isNew || admin || authUser?.personId === current?.id;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || '').trim() || undefined;

    save.mutate({
      name: selectedDirectoryUser?.fullName ?? text('name'),
      email: email || undefined,
      userId: directoryUserId || undefined,
      departmentId: departmentId || undefined,
      ...(canEditSite ? { siteId: siteId || undefined } : {}),
      employmentType: text('employmentType'),
      ...(isNew && selectedDirectoryUser?.jobTitle ? { title: selectedDirectoryUser.jobTitle } : {}),
      isActive,
    });
  }

  if (isNew && !canCreatePerson) {
    return <AccentSection accent="people" title="New person" subtitle="Add someone to the roster.">
      <p className="muted">{loading ? 'Checking your site assignment…' : 'Your People record must have an assigned site before you can add a person.'}</p>
    </AccentSection>;
  }

  return (
    <AccentSection
      accent="people"
      title={isNew ? 'New person' : (current?.name ?? 'Edit person')}
      subtitle={isNew ? 'Add someone to the roster.' : 'Update roster details.'}
      actions={
        <label className="switch" style={{ margin: 0 }}>
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-label">{isActive ? 'Active' : 'Inactive'}</span>
        </label>
      }
    >
      {error && <div className="alert error">{error}</div>}
      {!isNew && person.isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form className="card" onSubmit={handleSubmit} key={current?.id ?? 'new'}>
          <fieldset className="opportunity-fields" disabled={!canEdit}>
          {isNew && (
            <div className="grid cols-2">
              <div className="field">
                <label htmlFor="userSearch">Search directory (read-only User table)</label>
                <input
                  id="userSearch"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Type at least 3 characters"
                />
              </div>
              <div className="field">
                <label htmlFor="userId">Linked directory user</label>
                <select id="userId" name="userId" value={directoryUserId} onChange={(event) => setDirectoryUserId(event.target.value)}>
                  <option value="">— not linked —</option>
                  {directory.data?.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.fullName} {entry.email ? `(${entry.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" maxLength={200} defaultValue={current?.name ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" value={email} disabled title="Sourced from Active Directory" />
            </div>
          </div>

          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="departmentId">Department</label>
              <select id="departmentId" name="departmentId" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                <option value="">—</option>
                {departments.data?.filter((dept) => admin || dept.siteId?.toLowerCase() === site?.id.toLowerCase()).map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="functionDisplay">Function</label>
              <input id="functionDisplay" value={functionName} disabled />
            </div>
            <div className="field">
              <label htmlFor="employmentType">Employment type</label>
              <select id="employmentType" name="employmentType" defaultValue={current?.employmentType ?? 'FTE'}>
                {EMPLOYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="personSiteId">Site</label>
            {canEditSite ? (
              <select id="personSiteId" value={siteId} onChange={(event) => setSiteId(event.target.value)} required>
                <option value="">Select site</option>
                {sites.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            ) : <input id="personSiteId" value={site?.name ?? 'Site not assigned'} readOnly />}
          </div>

          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="title">Job title</label>
            <input id="title" value={title} disabled title="Sourced from Active Directory" />
          </div>

          </fieldset>
          <div className="row-actions">
            {canEdit && <button className="accent-button" type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save person'}
            </button>}
            <button type="button" onClick={() => navigate(inAdminPortal ? '/admin/people' : '/people')}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {inAdminPortal && !isNew && current && (
        <SkillsCard personId={current.id} canEdit={canEditSkills} subtitle="Skills recorded on this person's profile." />
      )}
    </AccentSection>
  );
}
