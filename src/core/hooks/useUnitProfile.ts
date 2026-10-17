import { useQuery } from '@tanstack/react-query';
import { unitProfileService } from '../../services/unitProfileService';

export const useUnitProfile = (unitId?: string | null) => {
  return useQuery({
    queryKey: ['unitProfile', unitId],
    queryFn: () => unitProfileService.getUnitProfile(unitId!),
    enabled: !!unitId,
  });
};
