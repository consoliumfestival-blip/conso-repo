import { supabase } from '../core/config/supabase';
import type { ChanceSheetRow } from './schedulePdfService';

type ChanceSheetQuery = {
  itemId: string;
  tenantId: string;
  festivalId: string;
};

/** Loads only the selected item's printable entry fields through the tenant-scoped admin RPC. */
export const chanceSheetService = {
  async loadRows(input: ChanceSheetQuery): Promise<ChanceSheetRow[]> {
    const { data, error } = await supabase.rpc('admin_chance_sheet_rows', {
      p_tenant_id: input.tenantId,
      p_festival_id: input.festivalId,
      p_item_id: input.itemId,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { chest_number: string | null; participant_name: string | null }[]).map((row) => ({
      chestNumber: String(row.chest_number ?? ''),
      name: String(row.participant_name ?? 'Unnamed participant'),
    }));
  },
};
