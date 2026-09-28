import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, lookupsApi, peopleApi } from '../api/client';
import AccentSection from '../components/admin/AccentSection';
import { useSiteAccess } from '../utils/useSiteAccess';

export default function SiteAssistantsPage() {
  const { site, isLead } = useSiteAccess();
  const queryClient = useQueryClient();
  const people = useQuery({ queryKey: ['people'], queryFn: () => peopleApi.list() });
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSelected(site?.assistantLeadPersonIds ?? []), [site?.id, site?.assistantLeadPersonIds]);

  const save = useMutation({
    mutationFn: () => lookupsApi.setSiteAssistants(site!.id, selected),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookups', 'sites'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['person'] });
      setError(null);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  return (
    <AccentSection accent="people" title={site?.name ?? 'Site assistants'} subtitle="Assistant site leads for your site.">
      {!isLead ? <p className="muted">Only the assigned site lead can manage assistants.</p> : (
        <div className="card">
          {error && <div className="alert error">{error}</div>}
          <div className="field" style={{ maxWidth: 480 }}>
            <label htmlFor="site-assistants">Assistant site leads</label>
            <select id="site-assistants" multiple size={10} value={selected} onChange={(event) =>
              setSelected(Array.from(event.target.selectedOptions, (option) => option.value))}>
              {(people.data ?? []).filter((person) => person.isActive !== false && person.id !== site?.leadPersonId
                && person.siteId?.toLowerCase() === site?.id.toLowerCase()).map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </div>
          <div className="row-actions">
            <button type="button" className="accent-button" disabled={save.isPending} onClick={() => save.mutate()}>Save assistants</button>
            <Link to="/people">Back to people</Link>
          </div>
        </div>
      )}
    </AccentSection>
  );
}