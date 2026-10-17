export interface Tenant {
  id: string;
  name: string;
  org_type: string;
}

export interface Festival {
  id: string;
  tenant_id: string;
  festival_year: number;
  level: string; // unit/sector/division/district
  is_active: boolean;
}

export interface Category {
  id: string;
  code: string; // LP/UP/HS/HSS/JR/SR/GN/CA/CG/CGP
  name_ml: string;
}

export interface Item {
  id: string;
  item_code: string;
  item_name_ml: string;
  participation_type: 'individual' | 'group';
  category_codes: string[];
  duration_minutes?: number;
  group_min_members?: number;
  group_max_members?: number;
  level_availability?: string[];
  daf_allowed?: boolean;
  white_dress_required?: boolean;
  regional_dialect_blocked?: boolean;
}

export interface Participant {
  id: string;
  name: string;
  category_code: string;
  user_id?: string | null;
  organisation_id?: string | null;
  is_post_hs_religious?: boolean;
  is_recognized_board_student?: boolean;
  is_terminated?: boolean;
  termination_reason?: string | null;
  photo_url?: string;
  phone?: string;
  org_name?: string;
  chest_number?: string;
  unique_code?: string;
  registered_by?: string;
  status?: string;
  plagiarism_ban_until?: string | null;
  id_card_uploaded?: boolean;
  residence_changed?: boolean;
  sector_certificate_url?: string;
  is_campus_parallel?: boolean;
  institution_name?: string;
  created_at?: string;
}

export interface Registration {
  id: string;
  participant_id: string;
  item: Item;
  organisation_id: string;
}

export interface PointsConfig {
  rank_1_points: number;
  rank_2_points: number;
  rank_3_points: number;
  grade_a_plus_points: number;
  grade_a_points: number;
  grade_b_points: number;
  grade_c_points: number;
}
