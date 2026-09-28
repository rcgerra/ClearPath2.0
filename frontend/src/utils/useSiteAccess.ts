import { useQuery } from '@tanstack/react-query';
import { lookupsApi, peopleApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

export function useSiteAccess() {
  const user = useAuthStore((state) => state.user);
  const selectedSiteId = useAuthStore((state) => state.selectedSiteId);
  const sites = useQuery({ queryKey: ['lookups', 'sites'], queryFn: () => lookupsApi.list('sites'), enabled: Boolean(user) });
  const person = useQuery({ queryKey: ['person', user?.personId], queryFn: () => peopleApi.get(user!.personId!), enabled: Boolean(user?.personId) });
  const site = sites.data?.find((row) => row.id.toLowerCase() === person.data?.siteId?.toLowerCase());
  const isLead = Boolean(user?.personId && site?.leadPersonId?.toLowerCase() === user.personId.toLowerCase());
  const isAssistant = Boolean(user?.personId && site?.assistantLeadPersonIds?.some((id) => id.toLowerCase() === user.personId?.toLowerCase()));
  const admin = Boolean(user?.roles.includes('admin'));
  const canCreate = admin || isLead || isAssistant;
  return { site, sites: sites.data ?? [], viewSiteId: admin ? selectedSiteId : site?.id ?? null,
    admin, isLead, canCreate, canCreatePerson: Boolean(site) && canCreate,
    loading: sites.isLoading || person.isLoading };
}