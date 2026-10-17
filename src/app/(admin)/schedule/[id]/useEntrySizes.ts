import { supabase } from '../../../../core/config/supabase';
import { useQuery } from '@tanstack/react-query';

export const useEntrySizes = (scheduleId: string | undefined, registrations: any[]) => {
  return useQuery({
    queryKey: ['entrySizes', scheduleId, registrations?.length],
    queryFn: async () => {
      if (!scheduleId || !registrations || registrations.length === 0) return {};
      
      const ids = registrations.map(r => r.id);
      
      const { data: rawData, error: rawError } = await supabase
        .from('registrations')
        .select('id, raw_group_members')
        .in('id', ids);
        
      if (rawError) throw rawError;

      const { data: gmData, error: gmError } = await supabase
        .from('group_members')
        .select('registration_id')
        .in('registration_id', ids);
        
      if (gmError) throw gmError;

      const counts: Record<string, number> = {};
      
      // Default size = 1 (individual or group leader)
      ids.forEach(id => { counts[id] = 1; });

      if (gmData) {
        gmData.forEach((gm: any) => {
          counts[gm.registration_id] = (counts[gm.registration_id] || 1) + 1;
        });
      }

      if (rawData) {
        rawData.forEach((r: any) => {
           if (r.raw_group_members && Array.isArray(r.raw_group_members) && r.raw_group_members.length > 0) {
             counts[r.id] = r.raw_group_members.length;
           }
        });
      }

      return counts;
    },
    enabled: !!scheduleId && (registrations?.length ?? 0) > 0,
  });
};
