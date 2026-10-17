import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import { X, UploadCloud, CheckCircle, Image as ImageIcon } from 'lucide-react-native';
import { supabase } from '../../../../core/config/supabase';
import { uploadService } from '../../../../services/storage/uploadService';
import { useTemplateStore } from '../Stores/templateStore';
import { useLayerStore } from '../Stores/layerStore';
import { DEFAULT_STARTER_TEMPLATE } from '../Stores/templateStore';
import { useQueryClient } from '@tanstack/react-query';

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
  red: '#EF4444',
  orange: '#F97316',
};

const ASPECT_OPTIONS = [
  { label: '1:1 Post', value: '1:1', width: 1080, height: 1080 },
  { label: '4:5 Portrait', value: '4:5', width: 1080, height: 1350 },
  { label: '9:16 Story', value: '9:16', width: 1080, height: 1920 },
  { label: '16:9 Landscape', value: '16:9', width: 1920, height: 1080 },
];

type Step = 'form' | 'uploading' | 'saving' | 'success';

interface Props {
  visible: boolean;
  festivalId: string;
  tenantId: string;
  onClose: () => void;
  /** Called with the newly created template ID so the caller can switch to it */
  onCreated: (templateId: string) => void;
}

export default function CreateTemplateModal({
  visible,
  festivalId,
  tenantId,
  onClose,
  onCreated,
}: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('form');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const getDimensions = () =>
    ASPECT_OPTIONS.find((o) => o.value === aspectRatio) || ASPECT_OPTIONS[0];

  const reset = () => {
    setStep('form');
    setUploadProgress(0);
    setError(null);
    setName('');
    setCategory('');
    setAspectRatio('1:1');
    setSelectedFile(null);
    setPreviewUrl(null);
    setCreatedId(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickFile = () => {
    if (typeof window === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = (e: any) => {
      const file: File = e.target.files[0];
      if (!file) return;
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    };
    input.click();
  };

  const handleCreate = useCallback(async () => {
    setError(null);

    if (!name.trim()) {
      setError('Please enter a template name.');
      return;
    }
    if (!selectedFile) {
      setError('Please select a background image.');
      return;
    }

    try {
      // ── STEP 1: Upload image to R2 ────────────────────────────────
      setStep('uploading');
      setUploadProgress(0);

      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const metadata = await uploadService.uploadTemplate(
        selectedFile,
        festivalId,
        tenantId,
        'background',
        ext,
        (p) => setUploadProgress(Math.round(p)),
      );
      const bgUrl = `r2://${metadata.object_key}`;
      setUploadProgress(100);

      // ── STEP 2: Build template record with UUID ───────────────────
      setStep('saving');
      const templateId = crypto.randomUUID();
      const dims = getDimensions();

      const defaultLayers = DEFAULT_STARTER_TEMPLATE.layers.map((l) => ({ ...l }));

      const insertPayload = {
        id: templateId,
        tenant_id: tenantId,
        festival_id: festivalId,
        name: name.trim(),
        background_url: bgUrl,
        width: dims.width,
        height: dims.height,
        aspect_ratio: dims.value,
        version: 1,
        field_mappings: {},
        layers: defaultLayers,
        schema_version: '1.0',
        status: 'draft',
        is_active: true,
        ...(category.trim() ? { category: category.trim() } : {}),
      };

      const { error: dbError } = await supabase
        .from('poster_templates')
        .insert(insertPayload);

      if (dbError) throw new Error(dbError.message);

      queryClient.invalidateQueries({ queryKey: ['poster-templates', festivalId] });

      // ── STEP 3: Load into Poster Studio store ─────────────────────
      useTemplateStore.getState().setActiveTemplate({
        id: templateId,
        name: name.trim(),
        background_url: bgUrl,
        width: dims.width,
        height: dims.height,
        aspect_ratio: dims.value,
        layers: defaultLayers,
        schema_version: '1.0',
        template_version: 1,
        status: 'draft',
        isLocal: false,
        isPublishable: true,
      });
      useLayerStore.getState().setLayers(defaultLayers);

      setCreatedId(templateId);
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setStep('form');
    }
  }, [name, selectedFile, aspectRatio, category, festivalId, tenantId]);

  const handleOpenInStudio = () => {
    if (createdId) onCreated(createdId);
    handleClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={step === 'form' ? handleClose : undefined}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Create Database Template</Text>
              <Text style={styles.headerSub}>
                Upload a background image → insert into Supabase → ready to publish
              </Text>
            </View>
            {step === 'form' && (
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <X size={18} color={colors.muted} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

            {/* ── SUCCESS STATE ── */}
            {step === 'success' && (
              <View style={styles.successCard}>
                <CheckCircle size={52} color={colors.green} />
                <Text style={styles.successTitle}>Template Created!</Text>
                <Text style={styles.successSub}>
                  <Text style={styles.bold}>{name}</Text> has been saved to Supabase with a unique UUID.
                  {'\n'}It is now available in the Poster Studio dropdown under{' '}
                  <Text style={styles.bold}>Custom Database Templates</Text>.
                </Text>
                <View style={styles.idBox}>
                  <Text style={styles.idLabel}>Template UUID</Text>
                  <Text style={styles.idValue} selectable>{createdId}</Text>
                </View>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleOpenInStudio}>
                  <Text style={styles.btnPrimaryText}>🎨 Open in Poster Studio</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnGhost} onPress={() => { reset(); }}>
                  <Text style={styles.btnGhostText}>Create Another Template</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── UPLOADING / SAVING STATE ── */}
            {(step === 'uploading' || step === 'saving') && (
              <View style={styles.progressCard}>
                <ActivityIndicator size="large" color={colors.teal} />
                <Text style={styles.progressTitle}>
                  {step === 'uploading'
                    ? `Uploading to Cloudflare R2… ${uploadProgress}%`
                    : 'Saving template to Supabase…'}
                </Text>
                {step === 'uploading' && (
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${uploadProgress}%` as any }]} />
                  </View>
                )}
                <Text style={styles.progressSub}>
                  {step === 'uploading'
                    ? 'Uploading background image via presigned R2 URL'
                    : 'Generating UUID and inserting into poster_templates'}
                </Text>
              </View>
            )}

            {/* ── FORM STATE ── */}
            {step === 'form' && (
              <>
                {error && (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>⚠ {error}</Text>
                  </View>
                )}

                {/* Background Image Picker */}
                <Text style={styles.fieldLabel}>Background Image *</Text>
                <TouchableOpacity style={styles.imagePickerBox} onPress={pickFile}>
                  {previewUrl ? (
                    <View style={styles.previewContainer}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }}
                      />
                      <View style={styles.previewOverlay}>
                        <Text style={styles.previewChangeText}>Tap to change</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <UploadCloud size={32} color={colors.muted} />
                      <Text style={styles.imagePlaceholderText}>
                        Tap to select JPG / PNG / WEBP
                      </Text>
                      <Text style={styles.imagePlaceholderSub}>Max 25 MB</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {selectedFile && (
                  <Text style={styles.fileName}>📎 {selectedFile.name}</Text>
                )}

                {/* Template Name */}
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Template Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Story Blue Gradient"
                  placeholderTextColor={colors.muted}
                  maxLength={100}
                />

                {/* Aspect Ratio */}
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Aspect Ratio</Text>
                <View style={styles.aspectRow}>
                  {ASPECT_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.aspectBtn, aspectRatio === opt.value && styles.aspectBtnActive]}
                      onPress={() => setAspectRatio(opt.value)}
                    >
                      <Text style={[styles.aspectBtnText, aspectRatio === opt.value && styles.aspectBtnTextActive]}>
                        {opt.label}
                      </Text>
                      <Text style={[styles.aspectDims, aspectRatio === opt.value && { color: colors.teal }]}>
                        {opt.width}×{opt.height}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Category (optional) */}
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Category (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={category}
                  onChangeText={setCategory}
                  placeholder="e.g. Qawwali, Sports, Academic"
                  placeholderTextColor={colors.muted}
                  maxLength={60}
                />

                {/* Flow summary */}
                <View style={styles.flowSummary}>
                  <Text style={styles.flowTitle}>What will happen:</Text>
                  {[
                    '1. Background image → R2 presigned upload',
                    '2. crypto.randomUUID() → unique template ID',
                    '3. Insert row into Supabase poster_templates',
                    '4. isPublishable: true → Publish button unlocked',
                    '5. Template appears in Poster Studio dropdown',
                  ].map((line) => (
                    <Text key={line} style={styles.flowLine}>
                      {line}
                    </Text>
                  ))}
                </View>

                {/* Actions */}
                <TouchableOpacity style={styles.btnPrimary} onPress={handleCreate}>
                  <UploadCloud size={18} color="#fff" />
                  <Text style={[styles.btnPrimaryText, { marginLeft: 8 }]}>
                    Create Database Template
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnGhost} onPress={handleClose}>
                  <Text style={styles.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,31,58,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.card,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 20,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.navy,
    fontFamily: 'Poppins_700Bold',
  },
  headerSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    fontFamily: 'Poppins_400Regular',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.bg,
  },
  body: {
    padding: 20,
    paddingBottom: 32,
    gap: 4,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: colors.red,
    fontFamily: 'Poppins_400Regular',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.2,
  },
  imagePickerBox: {
    height: 180,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  previewContainer: {
    flex: 1,
    position: 'relative',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 8,
    alignItems: 'center',
  },
  previewChangeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
  },
  imagePlaceholderSub: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: 'Poppins_400Regular',
  },
  fileName: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    fontFamily: 'Poppins_400Regular',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#FFFFFF',
    fontFamily: 'Poppins_400Regular',
  },
  aspectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aspectBtn: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  aspectBtnActive: {
    borderColor: colors.teal,
    backgroundColor: `${colors.teal}14`,
  },
  aspectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
  },
  aspectBtnTextActive: {
    color: colors.teal,
  },
  aspectDims: {
    fontSize: 10,
    color: '#94A3B8',
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  flowSummary: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    marginBottom: 4,
    gap: 4,
  },
  flowTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.teal,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 4,
  },
  flowLine: {
    fontSize: 11,
    color: '#166534',
    fontFamily: 'Poppins_400Regular',
    lineHeight: 18,
  },
  btnPrimary: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  btnGhost: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnGhostText: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  // Progress card
  progressCard: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  progressTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  progressSub: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  progressBarTrack: {
    width: '80%',
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: 99,
  },
  // Success card
  successCard: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.navy,
    fontFamily: 'Poppins_900Black',
  },
  successSub: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  idBox: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    width: '100%',
    gap: 4,
  },
  idLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  idValue: {
    fontSize: 11,
    color: colors.teal,
    fontFamily: 'Poppins_400Regular',
    letterSpacing: 0.5,
  },
});
