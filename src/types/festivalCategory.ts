export interface FestivalCategory {
  id: string;
  tenant_id: string;
  festival_id: string;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FestivalCategoryInput {
  name: string;
  code: string;
  sort_order: number;
}
