import { supabase } from '../core/config/supabase';

export type UnitParticipantRow = {
  id: string;
  name: string;
  chest_number: string;
  category_code: string;
  profile_slug: string | null;
  status: string;
  photo_url: string | null;
  registrations: {
    id: string;
    status: string;
    item_id: string;
    item: {
      name: string;
      name_ml: string | null;
    };
    results: {
      rank: number | null;
      grade: string | null;
      points_awarded: number;
    }[];
  }[];
};

export type UnitProfileData = {
  id: string;
  name: string;
  parent_id: string | null;
  participants: UnitParticipantRow[];
  stats: {
    totalParticipants: number;
    totalRegistrations: number;
    totalPresent: number;
    totalAbsent: number;
    totalPending: number;
    totalMissedItems?: number;
  };
};

const throwIfError = (error: { message: string } | null, dataError?: string) => {
  if (error) throw new Error(error.message);
  if (dataError) throw new Error(dataError);
};

export const unitProfileService = {
  async getUnitProfile(unitId: string): Promise<UnitProfileData | null> {
    const { data, error } = await supabase.rpc('get_public_unit_profile', {
      p_unit_id: unitId,
    });

    if (error) {
      throwIfError(error);
    }

    if (!data) return null;

    const profileData = data as any;
    const participants = profileData.participants || [];

    let totalRegistrations = 0;
    let totalPresent = 0;
    let totalPending = 0;
    let totalMissedItems = 0;

    participants.forEach((p: any) => {
      p.registrations = p.registrations || [];
      const isParticipantRejected = p.status === 'rejected';

      p.registrations.forEach((r: any) => {
        totalRegistrations++;
        
        if (isParticipantRejected || r.status === 'rejected') {
          totalMissedItems++;
        }
      });
    });

    return {
      id: profileData.id,
      name: profileData.name,
      parent_id: profileData.parent_id,
      participants: participants as UnitParticipantRow[],
      stats: {
        totalParticipants: participants.length,
        totalRegistrations,
        totalPresent: 0,
        totalAbsent: 0,
        totalPending: 0,
        totalMissedItems,
      },
    };
  },
};
