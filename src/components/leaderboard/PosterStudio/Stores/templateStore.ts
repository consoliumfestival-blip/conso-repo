import { create } from 'zustand';
import { LayerData, useLayerStore } from './layerStore';
import { supabase } from '../../../../core/config/supabase';
import { useAuthStore } from '../../../../core/store/authStore';
import { useOfflineStore } from './offlineStore';
import { db } from '../Database/db';
import { splitEventName, TypographyMode } from '../Utils/eventNameSplitter';
import { ResultNumberMode, NEXT_RESULT_MODE } from '../Utils/resultNumberPresets';

export type { TypographyMode };

export type PublishStatus = 'draft' | 'pending_approval' | 'published';

export interface VersionSnapshot {
  id: string;
  version_number: number;
  label?: string;
  content: LayerData[];
  created_at: string;
}

export interface TemplateVariables {
  event_name?: string;
  result_no?: string;
  [key: string]: string | undefined;
}

export interface BackgroundTransform {
  scale: number;
  x: number;
  y: number;
  isDraggable?: boolean;
}

export interface TemplateData {
  id?: string;
  name: string;
  background_url: string;
  background_transform?: BackgroundTransform;
  width: number;
  height: number;
  aspect_ratio: string;
  layers: LayerData[];
  schema_version: string;
  template_version: number;
  status: PublishStatus;
  /** true = local/demo only — cannot be published to Supabase */
  isLocal?: boolean;
  /** true = has a valid UUID and exists in Supabase poster_templates */
  isPublishable?: boolean;
}

interface TemplateStore {
  activeTemplate: TemplateData | null;
  variables: TemplateVariables;
  publishStatus: PublishStatus;
  versionHistory: VersionSnapshot[];
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;
  draftRecoveryAvailable: boolean;
  stableLayout: LayerData[] | null;

  // Actions
  loadStarterTemplate: () => void;
  resetLayersToStarter: () => void;
  loadDraftOnStart: (templateId?: string) => Promise<void>;

  setActiveTemplate: (t: TemplateData | null) => void;
  updateTemplateMeta: (patch: Partial<TemplateData>) => void;
  setVariables: (vars: TemplateVariables) => void;
  updateVariable: (key: string, value: string) => void;
  setPublishStatus: (s: PublishStatus) => void;
  setVersionHistory: (v: VersionSnapshot[]) => void;
  markSaved: () => void;
  markUnsaved: () => void;
  setDraftRecoveryAvailable: (v: boolean) => void;
  saveDraft: () => Promise<void>;
  restoreDraft: (templateId?: string) => Promise<void>;
  clearDraft: (templateId?: string) => Promise<void>;
  
  currentResultId: string | null;
  setCurrentResultId: (id: string | null) => void;
  saveResultOverride: () => Promise<void>;
  loadResultOverride: (resultId: string) => Promise<boolean>;
  updateStableLayout: () => void;

  typographyMode: TypographyMode;
  setTypographyMode: (mode: TypographyMode) => void;
  toggleTypographyMode: () => void;

  resultNumberMode: ResultNumberMode;
  cycleResultNumberMode: () => void;
}


export const DEFAULT_STARTER_TEMPLATE: TemplateData = {
  id: 'starter-template',
  name: 'Starter Template',
  background_url: '',
  width: 1080,
  height: 1080,
  aspect_ratio: '1:1',
  schema_version: '1.0',
  template_version: 1,
  status: 'draft',
  isLocal: true,
  isPublishable: false,
  layers: [
    { id: 'l1', type: 'text', version: '1.0', name: 'Result No', text: '{result_no}', x: 340, y: 80, width: 400, height: 60, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fontSize: 64, fontFamily: 'Authenia Textured', fontWeight: 400, fill: '#000000', align: 'center', zIndex: 1, isVisible: true, isLocked: false, lockProfile: 'editable', dynamicBinding: 'result_no' },
    { id: 'l2', type: 'text', version: '1.0', name: 'Category', text: '{category_name}', x: 240, y: 140, width: 600, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fontSize: 34, fontFamily: 'Inter', fontWeight: 600, fill: '#64748B', align: 'center', zIndex: 2, isVisible: true, isLocked: false, lockProfile: 'editable', dynamicBinding: 'category_name' },
    { id: 'l3', type: 'text', version: '1.0', name: 'Event Name', text: '{event_name}', x: 90, y: 220, width: 900, height: 220, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fontSize: 96, fontFamily: 'Noto Sans Malayalam', fontWeight: 900, fill: '#000000', align: 'center', overflowMode: 'auto-shrink', zIndex: 3, isVisible: true, isLocked: false, lockProfile: 'editable', dynamicBinding: 'event_name' },
    { id: 'l4', type: 'text', version: '1.0', name: '1st Place Name', text: '{name_1}', x: 180, y: 480, width: 760, height: 70, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fontSize: 54, fontFamily: 'Noto Sans Malayalam', fontWeight: 800, fill: '#000000', align: 'left', zIndex: 4, isVisible: true, isLocked: false, lockProfile: 'editable', dynamicBinding: 'name_1' },
    { id: 'l5', type: 'text', version: '1.0', name: '1st Place Unit', text: '{unit_1}', x: 180, y: 550, width: 760, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fontSize: 30, fontFamily: 'Noto Sans Malayalam', fontWeight: 500, fill: '#475569', align: 'left', zIndex: 5, isVisible: true, isLocked: false, lockProfile: 'editable', dynamicBinding: 'unit_1' },
    { id: 'l6', type: 'text', version: '1.0', name: '2nd Place Name', text: '{name_2}', x: 180, y: 660, width: 760, height: 70, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fontSize: 54, fontFamily: 'Noto Sans Malayalam', fontWeight: 800, fill: '#000000', align: 'left', zIndex: 6, isVisible: true, isLocked: false, lockProfile: 'editable', dynamicBinding: 'name_2' },
    { id: 'l7', type: 'text', version: '1.0', name: '2nd Place Unit', text: '{unit_2}', x: 180, y: 730, width: 760, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fontSize: 30, fontFamily: 'Noto Sans Malayalam', fontWeight: 500, fill: '#475569', align: 'left', zIndex: 7, isVisible: true, isLocked: false, lockProfile: 'editable', dynamicBinding: 'unit_2' },
    { id: 'l8', type: 'text', version: '1.0', name: '3rd Place Name', text: '{name_3}', x: 180, y: 840, width: 760, height: 70, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fontSize: 54, fontFamily: 'Noto Sans Malayalam', fontWeight: 800, fill: '#000000', align: 'left', zIndex: 8, isVisible: true, isLocked: false, lockProfile: 'editable', dynamicBinding: 'name_3' },
    { id: 'l9', type: 'text', version: '1.0', name: '3rd Place Unit', text: '{unit_3}', x: 180, y: 910, width: 760, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fontSize: 30, fontFamily: 'Noto Sans Malayalam', fontWeight: 500, fill: '#475569', align: 'left', zIndex: 9, isVisible: true, isLocked: false, lockProfile: 'editable', dynamicBinding: 'unit_3' },
  ],
};

const DEFAULT_VARIABLES: TemplateVariables = {
  event_name: 'BOOK TEST',
  category_name: 'Lower Primary',
  category_name_ml: 'ലോവർ പ്രൈമറി',
  result_no: '128',
  name_1: 'SHAMIL',
  unit_1: 'Kodasseri',
  name_2: 'NOUFAL',
  unit_2: 'Karuvarakkund',
  name_3: 'YASIN',
  unit_3: 'Kalikavu',
};

/** Inject event_name_primary + event_name_secondary computed variables */
function withComputedVars(vars: TemplateVariables, mode: TypographyMode): TemplateVariables {
  const split = splitEventName(vars.event_name || '', mode);
  return {
    ...vars,
    event_name_primary: split.primary,
    event_name_secondary: split.secondary,
  };
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  activeTemplate: null,
  variables: withComputedVars(DEFAULT_VARIABLES, 'A'),
  typographyMode: 'A',
  resultNumberMode: 'Medium',
  publishStatus: 'draft',
  versionHistory: [],
  lastSavedAt: null,
  hasUnsavedChanges: false,
  draftRecoveryAvailable: false,
  currentResultId: null,
  stableLayout: null,

  setCurrentResultId: (id) => set({ currentResultId: id }),

  setActiveTemplate: (t: TemplateData | null) => set({ activeTemplate: t, publishStatus: t?.status ?? 'draft', hasUnsavedChanges: false, stableLayout: t?.layers || null }),
  updateTemplateMeta: (patch) =>
    set((s) => ({
      activeTemplate: s.activeTemplate ? { ...s.activeTemplate, ...patch } : null,
      hasUnsavedChanges: true,
    })),
  setVariables: (variables) => set((s) => ({ variables: withComputedVars(variables, s.typographyMode) })),
  updateVariable: (key, value) => set((s) => {
    const updated = { ...s.variables, [key]: value };
    return { variables: withComputedVars(updated, s.typographyMode) };
  }),
  setPublishStatus: (publishStatus) => set({ publishStatus }),
  setVersionHistory: (versionHistory) => set({ versionHistory }),
  markSaved: () => set({ lastSavedAt: new Date(), hasUnsavedChanges: false }),
  markUnsaved: () => set({ hasUnsavedChanges: true }),
  setDraftRecoveryAvailable: (draftRecoveryAvailable) => set({ draftRecoveryAvailable }),
  updateStableLayout: () => {
    const layers = useLayerStore.getState().layers;
    set({ stableLayout: JSON.parse(JSON.stringify(layers)) });
  },

  setTypographyMode: (mode) => set((s) => ({
    typographyMode: mode,
    variables: withComputedVars(s.variables, mode),
  })),
  toggleTypographyMode: () => set((s) => {
    const next: TypographyMode = s.typographyMode === 'A' ? 'B' : 'A';
    return { typographyMode: next, variables: withComputedVars(s.variables, next) };
  }),

  cycleResultNumberMode: () => set((s) => {
    return { resultNumberMode: NEXT_RESULT_MODE[s.resultNumberMode] };
  }),

  loadStarterTemplate: () => {
    set({ activeTemplate: DEFAULT_STARTER_TEMPLATE, hasUnsavedChanges: false });
    useLayerStore.getState().setLayers(DEFAULT_STARTER_TEMPLATE.layers);
  },

  resetLayersToStarter: () => {
    const newLayers = DEFAULT_STARTER_TEMPLATE.layers.map(l => ({ ...l, id: l.id + '_' + Date.now().toString(36) }));
    useLayerStore.getState().setLayers(newLayers);
    const at = get().activeTemplate;
    if (at) {
      set({ activeTemplate: { ...at, layers: newLayers }, hasUnsavedChanges: true });
    } else {
      set({ hasUnsavedChanges: true });
    }
    // Clear old IndexedDB draft so it doesn't reload old layers
    const tid = at?.id;
    if (tid) db.templates.delete(tid).catch(() => {});
  },

  loadDraftOnStart: async (templateId?: string) => {
    // Helper: detect if layers are the old default template (small fonts)
    // and auto-upgrade them to the new starter typography
    const upgradeOldDefaultLayers = (layers: LayerData[]): LayerData[] => {
      if (!layers || layers.length === 0) return DEFAULT_STARTER_TEMPLATE.layers.map(l => ({ ...l }));
      
      // Detect old default v1: layers contain old IDs like l3_unit, l4_unit, l5_unit
      const oldIds = ['l3_unit', 'l4_unit', 'l5_unit'];
      const hasOldIds = layers.some(l => oldIds.includes(l.id));
      
      // Detect old default v1: name layers have tiny fonts (old used 56px or 48px)
      const nameLayers = layers.filter(l => l.dynamicBinding && ['name_1', 'name_2', 'name_3'].includes(l.dynamicBinding));
      const hasOldSmallNames = nameLayers.length > 0 && nameLayers.every(l => (l.fontSize || 0) <= 48);
      const unitLayers = layers.filter(l => l.dynamicBinding && ['unit_1', 'unit_2', 'unit_3'].includes(l.dynamicBinding));
      const hasOldSmallUnits = unitLayers.length > 0 && unitLayers.every(l => (l.fontSize || 0) <= 24);
      
      // Detect intermediate version: name layers have embedded rank numbers like "1   {name_1}"
      const hasEmbeddedRanks = nameLayers.some(l => l.text && /^\d\s+\{/.test(l.text));
      
      // Detect missing separate rank layers (l4r, l6r, l8r) — if they don't exist, need upgrade
      const hasSeparateRanks = layers.some(l => ['l4r', 'l6r', 'l8r'].includes(l.id) || l.name === '1st Rank' || l.name === '2nd Rank' || l.name === '3rd Rank');
      const needsRankLayers = nameLayers.length > 0 && !hasSeparateRanks;
      
      if (hasOldIds || (hasOldSmallNames && hasOldSmallUnits) || hasEmbeddedRanks || needsRankLayers) {
        console.log('[PosterStudio] Detected old default layers, upgrading to new starter typography');
        return DEFAULT_STARTER_TEMPLATE.layers.map(l => ({ ...l }));
      }
      
      return layers;
    };

    try {
      const targetId = templateId || get().activeTemplate?.id || 'demo-template-1';
      
      if (targetId === 'starter-template') {
        get().loadStarterTemplate();
        return;
      }
      
      const draft = await db.templates.get(targetId);
      if (draft) {
        const upgradedLayers = upgradeOldDefaultLayers(draft.layers);
        set({
          activeTemplate: {
            id: draft.id,
            name: draft.name,
            background_url: draft.background_url,
            background_transform: draft.background_transform,
            width: draft.width,
            height: draft.height,
            aspect_ratio: draft.aspect_ratio,
            layers: upgradedLayers,
            schema_version: draft.schema_version,
            template_version: draft.template_version,
            status: draft.status as PublishStatus,
            // Preserve local/publishable flags from the saved draft
            isLocal: draft.isLocal ?? true,
            isPublishable: draft.isPublishable ?? false,
          },
          variables: draft.variables,
          hasUnsavedChanges: false,
          stableLayout: upgradedLayers
        });
        
        // Push layers to layerStore immediately
        useLayerStore.getState().setLayers(upgradedLayers);
        console.log('[PosterStudio] Restored draft from IndexedDB');
      } else {
        // Fetch from Supabase if targetId is a valid UUID
        const isUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        if (isUUID(targetId)) {
          console.log('[PosterStudio] Draft not found in IndexedDB, fetching template from Supabase:', targetId);
          const { data, error } = await supabase
            .from('poster_templates')
            .select('*')
            .eq('id', targetId)
            .single();

          if (error) {
            console.error('[PosterStudio] Failed to fetch template from Supabase:', error);
          } else if (data) {
            // Upgrade old default layers to new starter typography
            const loadedLayers = upgradeOldDefaultLayers(data.layers || []);
            set({
              activeTemplate: {
                id: data.id,
                name: data.name,
                background_url: data.background_url,
                background_transform: data.background_transform || undefined,
                width: data.width,
                height: data.height,
                aspect_ratio: data.aspect_ratio,
                layers: loadedLayers,
                schema_version: data.schema_version || '1.0',
                template_version: data.version || 1,
                status: data.status as PublishStatus,
                // Templates from Supabase have valid UUIDs and are publishable
                isLocal: false,
                isPublishable: true,
              },
              variables: {},
              hasUnsavedChanges: false,
              stableLayout: loadedLayers
            });
            useLayerStore.getState().setLayers(loadedLayers);
            return;
          }
        }

        // No draft in IndexedDB and no Supabase data found.
        // If the id is not a UUID (e.g. a local/demo ID), leave activeTemplate as null.
        // The PosterStudio will show the empty state CTA instead.
        const isUUIDCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId);
        if (!isUUIDCheck) {
          // Local/demo ID — do not fall back to demo template in the store
          set({ activeTemplate: null });
          useLayerStore.getState().setLayers([]);
        } else {
          // Valid UUID but not found anywhere — show empty canvas
          set({ activeTemplate: null, stableLayout: null });
          useLayerStore.getState().setLayers([]);
        }
      }
    } catch (e) {
      console.error('[PosterStudio] Failed to load draft', e);
      useLayerStore.getState().setLayers(DEFAULT_STARTER_TEMPLATE.layers);
    }
  },

  saveResultOverride: async () => {
    const { activeTemplate, currentResultId } = get();
    if (!activeTemplate || !currentResultId) return;

    try {
      const currentLayers = useLayerStore.getState().layers;
      const baseLayers = activeTemplate.layers;

      const overrides: Record<string, any> = {};
      const currentMap = new Map(currentLayers.map(l => [l.id, l]));
      const baseMap = new Map(baseLayers.map(l => [l.id, l]));

      // Find deleted and modified layers
      baseLayers.forEach(baseLayer => {
        const currentLayer = currentMap.get(baseLayer.id);
        if (!currentLayer) {
          overrides[baseLayer.id] = { deleted: true };
        } else {
          const diff: any = {};
          let hasChanges = false;
          Object.keys(currentLayer).forEach(key => {
            if ((currentLayer as any)[key] !== (baseLayer as any)[key]) {
              diff[key] = (currentLayer as any)[key];
              hasChanges = true;
            }
          });
          if (hasChanges) {
            overrides[baseLayer.id] = diff;
          }
        }
      });

      // Find strictly added layers
      currentLayers.forEach(currentLayer => {
        if (!baseMap.has(currentLayer.id)) {
          overrides[currentLayer.id] = { ...currentLayer, added: true };
        }
      });

      const overrideDoc = {
        id: `${activeTemplate.id || 'demo-template-1'}_${currentResultId}`,
        templateId: activeTemplate.id || 'demo-template-1',
        resultId: currentResultId,
        overrides,
        updatedAt: new Date().toISOString(),
      };

      await db.result_overrides.put(overrideDoc);
      set({ lastSavedAt: new Date(), hasUnsavedChanges: false });
      console.log('[PosterStudio] Saved result override patch to IndexedDB');
    } catch (e) {
      console.error('[PosterStudio] Failed to save result override', e);
    }
  },

  loadResultOverride: async (resultId: string) => {
    const { activeTemplate, stableLayout, currentResultId } = get();
    if (!activeTemplate) return false;

    let baseLayers = stableLayout || activeTemplate.layers;
    
    // If we are moving from the Base Template to a Result, capture the current canvas as the new base!
    if (currentResultId === null) {
      baseLayers = useLayerStore.getState().layers;
      set({ stableLayout: JSON.parse(JSON.stringify(baseLayers)) });
    }

    try {
      const id = `${activeTemplate.id || 'demo-template-1'}_${resultId}`;
      const overrideDoc = await db.result_overrides.get(id);

      if (overrideDoc) {
        // Deep copy baseLayers to avoid mutating the store
        baseLayers = JSON.parse(JSON.stringify(baseLayers));
        const finalLayers: LayerData[] = [];

        // Apply modifications and deletions
        baseLayers.forEach((baseLayer: LayerData) => {
          const patch = overrideDoc.overrides[baseLayer.id];
          if (patch?.deleted) return; // Skip deleted layers
          if (patch) {
            finalLayers.push({ ...baseLayer, ...patch });
          } else {
            finalLayers.push(baseLayer);
          }
        });

        // Append newly added layers
        Object.values(overrideDoc.overrides).forEach((patch: any) => {
          if (patch.added) {
            finalLayers.push(patch as LayerData);
          }
        });

        useLayerStore.getState().setLayers(finalLayers);
        console.log('[PosterStudio] Restored result override patch');
        return true;
      } else {
        // Reset to inherited stable layout if no override exists
        useLayerStore.getState().setLayers(JSON.parse(JSON.stringify(baseLayers)));
        return false;
      }
    } catch (e) {
      console.error('[PosterStudio] Failed to load result override', e);
      useLayerStore.getState().setLayers(JSON.parse(JSON.stringify(baseLayers)));
      return false;
    }
  },

  saveDraft: async () => {
    const { activeTemplate, variables, currentResultId } = get();
    if (!activeTemplate) return;

    if (currentResultId) {
      await get().saveResultOverride();
      return;
    }

    try {
      const currentLayers = useLayerStore.getState().layers;
      const fullDraft = {
        id: activeTemplate.id || 'demo-template-1',
        name: activeTemplate.name,
        background_url: activeTemplate.background_url,
        background_transform: activeTemplate.background_transform,
        width: activeTemplate.width,
        height: activeTemplate.height,
        aspect_ratio: activeTemplate.aspect_ratio,
        layers: currentLayers,
        variables: variables,
        schema_version: activeTemplate.schema_version,
        template_version: activeTemplate.template_version,
        status: activeTemplate.status,
        // Persist publish flags so they survive page refresh
        isLocal: activeTemplate.isLocal ?? true,
        isPublishable: activeTemplate.isPublishable ?? false,
        updatedAt: new Date().toISOString()
      };

      await db.templates.put(fullDraft);
      set({ lastSavedAt: new Date(), hasUnsavedChanges: false, stableLayout: JSON.parse(JSON.stringify(currentLayers)) });
    } catch (e) {
      console.error('[PosterStudio] Failed to save draft', e);
    }
  },

  restoreDraft: async (templateId?: string) => {
    await get().loadDraftOnStart(templateId);
  },

  clearDraft: async (templateId?: string) => {
    try {
      const targetId = templateId || get().activeTemplate?.id || 'demo-template-1';
      await db.templates.delete(targetId);
      set({ draftRecoveryAvailable: false });
    } catch (e) {}
  },
}));
