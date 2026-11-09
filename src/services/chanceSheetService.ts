import { supabase } from '../core/config/supabase';
import type { ChanceSheetRow } from './schedulePdfService';

type ChanceSheetQuery = {
  itemId: string;
  tenantId: string;
  festivalId: string;
  participationType: 'individual' | 'group';
};

/** Loads only the selected item's printable entry fields; code letters are never selected. */
export const chanceSheetService = {
  async loadRows(input: ChanceSheetQuery): Promise<ChanceSheetRow[]> {
    if (input.participationType === 'group') {
      const { data, error } = await supabase
        .from('registrations')
        .select('id, status, entry_chest_number, organisation:organisations(name)')
        .eq('tenant_id', input.tenantId)
        .eq('festival_id', input.festivalId)
        .eq('item_id', input.itemId)
        .eq('entry_kind', 'general_team')
        .order('id', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((entry: any) => entry.status !== 'rejected')
        .map((entry: any) => ({
          chestNumber: String(entry.entry_chest_number || ''),
          name: String(entry.organisation?.name || 'Unnamed group'),
        }));
    }

    const { data, error } = await supabase
      .from('registrations')
      .select('id, item_id, tenant_id, festival_id, participant_id, status, participants:participants!registrations_participant_id_fkey(name, chest_number)')
      .eq('tenant_id', input.tenantId)
      .eq('festival_id', input.festivalId)
      .eq('item_id', input.itemId)
      .order('id', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((registration: any) => registration.status !== 'rejected' && registration.participant_id && registration.participants)
      .map((registration: any) => {
        const participant = Array.isArray(registration.participants) ? registration.participants[0] : registration.participants;
        return {
          chestNumber: String(participant?.chest_number || ''),
          name: String(participant?.name || 'Unnamed participant'),
        };
      });
  },
};
