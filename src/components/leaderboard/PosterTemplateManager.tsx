import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronDown, Plus, Trash2, UploadCloud } from 'lucide-react-native';
import { useGetPosterTemplates, useUpsertPosterTemplate, useDeletePosterTemplate } from '../../core/hooks/useLeaderboardSettings';
import { uploadService } from '../../services/storage/uploadService';
import { useQueryClient } from '@tanstack/react-query';
import CreateTemplateModal from './PosterStudio/Templates/CreateTemplateModal';

const colors = {
  navy: '#0B1F3A',
  blue: '#123B73',
  cyan: '#16B8D9',
  teal: '#0F766E',
  green: '#22C55E',
  bg: '#F3F8FB',
  card: '#FFFFFF',
  border: '#DDEAF1',
  text: '#0F172A',
  muted: '#64748B',
  soft: '#EAF7FA',
};

const DEFAULT_BACKGROUND = 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1080&auto=format&fit=crop';

type MappingConfig = {
  x: number;
  y: number;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  maxWidth: number;
};

type TemplateMappingSchema = {
  title?: MappingConfig;
  unit_name?: MappingConfig;
  points?: MappingConfig;
  rank?: MappingConfig;
};

export default function PosterTemplateManager({
  tenantId,
  festivalId,
}: {
  tenantId: string;
  festivalId: string;
}) {
  const { data: templates = [], isLoading } = useGetPosterTemplates(festivalId);
  const upsertTemplate = useUpsertPosterTemplate(tenantId, festivalId);
  const deleteTemplate = useDeletePosterTemplate(festivalId);
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // New template form state
  const [name, setName] = useState('');
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [mappings, setMappings] = useState<TemplateMappingSchema>({
    title: { x: 540, y: 150, fontSize: 48, color: '#FFFFFF', align: 'center', maxWidth: 900 },
    unit_name: { x: 540, y: 500, fontSize: 64, color: '#16B8D9', align: 'center', maxWidth: 900 },
    points: { x: 540, y: 680, fontSize: 84, color: '#FFFFFF', align: 'center', maxWidth: 900 },
    rank: { x: 540, y: 840, fontSize: 52, color: '#0F766E', align: 'center', maxWidth: 900 },
  });

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const handleFieldMappingChange = (
    field: keyof TemplateMappingSchema,
    key: keyof MappingConfig,
    value: string | number
  ) => {
    setMappings((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        [key]: value,
      },
    }));
  };

  const pickAndUploadBackground = async () => {
    if (typeof window === 'undefined') return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      setIsUploading(true);
      setUploadProgress(0);
      try {
        const metadata = await uploadService.uploadTemplate(
          file,
          festivalId,
          tenantId,
          'background',
          file.name?.split('.').pop()?.toLowerCase() || 'jpg',
          (progress) => setUploadProgress(Math.round(progress))
        );

        // Auto-save the template into the DB
        await upsertTemplate.mutateAsync({
          name: name || `Template ${templates.length + 1}`,
          background_url: metadata.file_url,
          width,
          height,
          aspect_ratio: aspectRatio,
          field_mappings: mappings,
          is_active: true,
          version: 1,
        });

        alert('Template background uploaded and saved!');
        setName('');
      } catch (err: any) {
        alert('Upload failed: ' + err.message);
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  };

  const handleSaveMappings = async () => {
    if (!selectedTemplate) return;
    try {
      await upsertTemplate.mutateAsync({
        ...selectedTemplate,
        field_mappings: mappings,
      });
      alert('Mappings updated successfully!');
    } catch (err: any) {
      alert('Error updating mappings: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.teal} />
        <Text style={styles.loadingText}>Loading poster templates...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Create Template Modal ── */}
      <CreateTemplateModal
        visible={showCreateModal}
        festivalId={festivalId}
        tenantId={tenantId}
        onClose={() => setShowCreateModal(false)}
        onCreated={(newId) => {
          // Refresh the dropdown list so the new template appears immediately
          queryClient.invalidateQueries({ queryKey: ['poster-templates', festivalId] });
          setSelectedTemplateId(newId);
          setShowCreateModal(false);
        }}
      />

      <View style={styles.templatesHeader}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.sectionTitle}>Poster Templates</Text>
            <Text style={styles.sectionSub}>Configure branding backgrounds and field overlays.</Text>
          </View>
          {/* ── PRIMARY ACTION BUTTON ── */}
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowCreateModal(true)}
          >
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.createBtnText}>Create Database Template</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.layout}>
        {/* Template List & Creator */}
        <View style={styles.leftPane}>
          <Text style={styles.paneTitle}>Active Templates</Text>
          <ScrollView style={styles.templateList} showsVerticalScrollIndicator={true}>
            {templates.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No templates uploaded yet</Text>
              </View>
            ) : (
              templates.map((tpl) => (
                <TouchableOpacity
                  key={tpl.id}
                  onPress={() => {
                    setSelectedTemplateId(tpl.id || null);
                    setMappings(tpl.field_mappings || {});
                  }}
                  style={[
                    styles.templateItem,
                    selectedTemplate?.id === tpl.id && styles.templateItemActive,
                  ]}
                >
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemTitle}>{tpl.name}</Text>
                    <TouchableOpacity
                      onPress={async () => {
                        if (confirm('Are you sure you want to delete this template?')) {
                          await deleteTemplate.mutateAsync(tpl.id!);
                          alert('Template deleted.');
                        }
                      }}
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.itemMeta}>
                    {tpl.aspect_ratio} ({tpl.width}x{tpl.height}) • v{tpl.version}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* Create New Template Card */}
          <View style={styles.createCard}>
            <Text style={styles.cardTitle}>Create Custom Template</Text>

            <TextInput
              placeholder="Template Name (e.g. Story Blue)"
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholderTextColor={colors.muted}
            />

            <View style={styles.dimensionsRow}>
              <TouchableOpacity
                onPress={() => {
                  setWidth(1080);
                  setHeight(1080);
                  setAspectRatio('1:1');
                }}
                style={[styles.dimButton, aspectRatio === '1:1' && styles.dimButtonActive]}
              >
                <Text style={[styles.dimText, aspectRatio === '1:1' && styles.dimTextActive]}>1:1 Post</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setWidth(1080);
                  setHeight(1350);
                  setAspectRatio('4:5');
                }}
                style={[styles.dimButton, aspectRatio === '4:5' && styles.dimButtonActive]}
              >
                <Text style={[styles.dimText, aspectRatio === '4:5' && styles.dimTextActive]}>4:5 Portrait</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setWidth(1080);
                  setHeight(1920);
                  setAspectRatio('9:16');
                }}
                style={[styles.dimButton, aspectRatio === '9:16' && styles.dimButtonActive]}
              >
                <Text style={[styles.dimText, aspectRatio === '9:16' && styles.dimTextActive]}>9:16 Story</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={pickAndUploadBackground}
              style={styles.uploadButton}
              disabled={isUploading}
            >
              <UploadCloud size={20} color="#FFFFFF" />
              <Text style={styles.uploadButtonText}>
                {isUploading ? `Uploading ${uploadProgress}%` : 'Upload Template Background'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Coordinate Config / Preview */}
        <View style={styles.rightPane}>
          <Text style={styles.paneTitle}>Field Coordinates & Scaling</Text>
          <Text style={styles.paneSub}>Adjust typography alignment, size, color and offsets.</Text>

          {selectedTemplate ? (
            <ScrollView style={{ flex: 1, gap: 14 }}>
              {(['title', 'unit_name', 'points', 'rank'] as const).map((field) => (
                <View key={field} style={styles.fieldConfigCard}>
                  <Text style={styles.fieldLabel}>{field.replace('_', ' ').toUpperCase()}</Text>
                  <View style={styles.fieldGrid}>
                    <View style={styles.gridCell}>
                      <Text style={styles.cellLabel}>X Offset (px)</Text>
                      <TextInput
                        value={String(mappings[field]?.x ?? 0)}
                        onChangeText={(v) => handleFieldMappingChange(field, 'x', Number(v) || 0)}
                        keyboardType="numeric"
                        style={styles.gridInput}
                      />
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.cellLabel}>Y Offset (px)</Text>
                      <TextInput
                        value={String(mappings[field]?.y ?? 0)}
                        onChangeText={(v) => handleFieldMappingChange(field, 'y', Number(v) || 0)}
                        keyboardType="numeric"
                        style={styles.gridInput}
                      />
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.cellLabel}>Font Size (px)</Text>
                      <TextInput
                        value={String(mappings[field]?.fontSize ?? 12)}
                        onChangeText={(v) => handleFieldMappingChange(field, 'fontSize', Number(v) || 0)}
                        keyboardType="numeric"
                        style={styles.gridInput}
                      />
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.cellLabel}>Color (Hex)</Text>
                      <TextInput
                        value={mappings[field]?.color ?? '#FFFFFF'}
                        onChangeText={(v) => handleFieldMappingChange(field, 'color', v)}
                        style={styles.gridInput}
                      />
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity onPress={handleSaveMappings} style={styles.applyMappingsBtn}>
                <Text style={styles.applyMappingsText}>Save Coordinate Mapping</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={styles.noTemplateSelected}>
              <Text style={styles.noTemplateText}>Create or select a template to configure mappings.</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginTop: 24,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'Poppins_400Regular',
    color: colors.muted,
    fontSize: 14,
  },
  templatesHeader: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  sectionTitle: {
    fontFamily: 'Poppins_900Black',
    fontSize: 20,
    color: colors.text,
  },
  sectionSub: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: colors.muted,
  },
  layout: {
    flexDirection: 'row',
    gap: 20,
    flexWrap: 'wrap',
  },
  leftPane: {
    flex: 1,
    minWidth: 320,
    gap: 14,
  },
  paneTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
    color: colors.text,
    marginBottom: 6,
  },
  paneSub: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: colors.muted,
    marginBottom: 14,
  },
  templateList: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 8,
    backgroundColor: colors.bg,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Poppins_400Regular',
    color: colors.muted,
    fontSize: 13,
  },
  templateItem: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  templateItemActive: {
    borderColor: colors.cyan,
    backgroundColor: colors.soft,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  itemMeta: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: colors.muted,
  },
  createCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 16,
    gap: 12,
    backgroundColor: '#FAFDFE',
  },
  cardTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: colors.text,
    backgroundColor: '#FFFFFF',
  },
  dimensionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dimButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimButtonActive: {
    borderColor: colors.teal,
    backgroundColor: `${colors.teal}14`,
  },
  dimText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    color: colors.muted,
  },
  dimTextActive: {
    color: colors.teal,
  },
  uploadButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadButtonText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  rightPane: {
    flex: 1.2,
    minWidth: 360,
  },
  fieldConfigCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  fieldLabel: {
    fontFamily: 'Poppins_900Black',
    fontSize: 11,
    color: colors.teal,
    letterSpacing: 1,
    marginBottom: 10,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCell: {
    flex: 1,
    minWidth: 80,
  },
  cellLabel: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 10,
    color: colors.muted,
    marginBottom: 4,
  },
  gridInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    height: 36,
    paddingHorizontal: 8,
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    color: colors.text,
  },
  applyMappingsBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  applyMappingsText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  noTemplateSelected: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: 'dashed',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noTemplateText: {
    fontFamily: 'Poppins_400Regular',
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
});
