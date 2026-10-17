import Dexie, { Table } from 'dexie';
import { LayerData } from '../Stores/layerStore';
import { TemplateVariables, BackgroundTransform } from '../Stores/templateStore';

export interface ResultOverride {
  id: string; // Composite key: `${templateId}_${resultId}`
  templateId: string;
  resultId: string;
  overrides: Record<string, Partial<LayerData> & { deleted?: boolean; added?: boolean }>;
  updatedAt: string;
}

export interface TemplateDraft {
  id: string; // The template ID or 'local_draft'
  name: string;
  background_url: string;
  background_transform?: BackgroundTransform;
  width: number;
  height: number;
  aspect_ratio: string;
  layers: LayerData[];
  variables: TemplateVariables;
  schema_version: string;
  template_version: number;
  status: string;
  updatedAt: string;
  /** Persisted so publish status survives page refresh */
  isLocal?: boolean;
  isPublishable?: boolean;
}

export class PosterStudioDatabase extends Dexie {
  templates!: Table<TemplateDraft>;
  result_overrides!: Table<ResultOverride>;

  constructor() {
    super('PosterStudioDatabase');
    this.version(1).stores({
      templates: 'id, updatedAt' // Primary key and indexed props
    });
    this.version(2).stores({
      templates: 'id, updatedAt',
      result_overrides: 'id, templateId, resultId, updatedAt'
    });
  }
}

export const db = new PosterStudioDatabase();
