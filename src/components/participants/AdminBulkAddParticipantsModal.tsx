import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Users, X } from 'lucide-react-native';
import { Modal } from '@/components/ui/CoreModal';
import { SsfSelectMenu } from '@/components/ui/SsfSelectMenu';
import { ui } from '@/constants/designSystem';
import { useFestivalCategories } from '@/core/hooks/useFestivalCategories';
import { CATEGORIES } from '@/constants/categories';
import { participantService, type OrganisationOption } from '@/services/participantService';
import { parseParticipantNames } from '@/core/utils/bulkParticipantInput';

type Props = {
  visible: boolean;
  tenantId?: string | null;
  festivalId?: string | null;
  festivalTemplate?: string | null;
  festivalLevel?: string | null;
  chestNumberTemplate?: string | null;
  genderMode?: 'boys_only' | 'girls_only' | 'both' | null;
  onClose: () => void;
  onCreated: (count: number) => void;
};

export function AdminBulkAddParticipantsModal({
  visible, tenantId, festivalId, festivalTemplate, festivalLevel, chestNumberTemplate, genderMode, onClose, onCreated,
}: Props) {
  const { width, height } = useWindowDimensions();
  const categoriesQuery = useFestivalCategories(festivalId ?? undefined, false);
  const [organisations, setOrganisations] = useState<OrganisationOption[]>([]);
  const [organisationsLoading, setOrganisationsLoading] = useState(false);
  const [organisationError, setOrganisationError] = useState('');
  const [teamId, setTeamId] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState<'boys' | 'girls'>(genderMode === 'girls_only' ? 'girls' : 'boys');
  const [namesText, setNamesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const effectiveGenderMode = genderMode ?? 'both';

  useEffect(() => {
    if (!visible || !tenantId) return;
    let cancelled = false;
    setOrganisationsLoading(true);
    setOrganisationError('');
    participantService.listOrganisations(tenantId)
      .then((rows) => { if (!cancelled) setOrganisations(rows); })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setOrganisations([]);
        setOrganisationError(loadError instanceof Error ? loadError.message : 'Could not load teams.');
      })
      .finally(() => { if (!cancelled) setOrganisationsLoading(false); });
    return () => { cancelled = true; };
  }, [visible, tenantId]);

  const currentOrganisation = organisations.find((organisation) => organisation.tenant_id === tenantId);
  const scopedOrganisations = useMemo(() => (
    chestNumberTemplate === 'team' || ['sector', 'division'].includes(String(festivalLevel || '').toLowerCase())
      ? organisations.filter((organisation) => organisation.parent_id === currentOrganisation?.id)
      : organisations
  ), [chestNumberTemplate, currentOrganisation?.id, festivalLevel, organisations]);
  const activeCategories = (categoriesQuery.data ?? []).filter((item) => item.is_active);
  const categoriesByCode = new Map<string, { label: string; value: string }>();
  if (festivalTemplate !== 'college_fest') {
    CATEGORIES.forEach((item) => categoriesByCode.set(item.code, { label: `${item.name_en} (${item.code})`, value: item.code }));
  }
  activeCategories.forEach((item) => categoriesByCode.set(item.code, { label: `${item.name} (${item.code})`, value: item.code }));
  const categoryOptions = Array.from(categoriesByCode.values());
  const teamOptions = scopedOrganisations.map((item) => ({ label: item.name, value: item.id }));

  const reset = () => {
    setTeamId(''); setCategory(''); setGender(effectiveGenderMode === 'girls_only' ? 'girls' : 'boys');
    setNamesText(''); setError('');
  };
  const close = () => { if (!saving) { reset(); onClose(); } };

  const save = async () => {
    setError('');
    if (!tenantId || !festivalId) { setError('Select an active festival before adding participants.'); return; }
    if (!teamId) { setError('Select a team.'); return; }
    if (!category) { setError('Select a category.'); return; }
    let names: string[];
    try { names = parseParticipantNames(namesText); }
    catch (parseError) { setError(parseError instanceof Error ? parseError.message : 'Check the participant names.'); return; }

    setSaving(true);
    try {
      const count = await participantService.createParticipantsWithChestNumbers({
        tenant_id: tenantId, festival_id: festivalId, organisation_id: teamId,
        category_code: category, gender, names,
      });
      reset();
      onClose();
      onCreated(count);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not add this participant batch.');
    } finally { setSaving(false); }
  };

  const modalWidth = Math.min(680, width - 28);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 14 }}>
        <View {...{ dataSet: { coreGlass: 'sheet' } } as any} style={{ width: modalWidth, maxHeight: Math.min(height - 28, 820), backgroundColor: ui.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: ui.colors.border, overflow: 'hidden', shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 24, elevation: 18 }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: ui.colors.border, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Users size={20} color={ui.colors.primaryText} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: ui.colors.text, fontSize: 20, fontWeight: '800' }}>Add multiple participants</Text>
              <Text style={{ color: ui.colors.textMuted, fontSize: 12, marginTop: 3 }}>Select a team and category, then enter one name per line.</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close add multiple participants" disabled={saving} onPress={close} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><X size={20} color={ui.colors.textMuted} /></TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 18, gap: 14 }}>
            <View>
              <Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Team</Text>
              {organisationsLoading ? <ActivityIndicator color={ui.colors.primary} /> : organisationError ? <Text style={{ color: ui.colors.danger, fontSize: 12 }}>{organisationError}</Text> : (
                <SsfSelectMenu value={teamId} onValueChange={setTeamId} options={teamOptions} placeholder="Select a team" searchable width={modalWidth - 40} />
              )}
              {!organisationsLoading && !organisationError && teamOptions.length === 0 && <Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 4 }}>No teams available for this festival.</Text>}
            </View>
            <View>
              <Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Category</Text>
              {categoriesQuery.isLoading ? <ActivityIndicator color={ui.colors.primary} /> : categoriesQuery.isError ? <Text style={{ color: ui.colors.danger, fontSize: 12 }}>Could not load festival categories.</Text> : (
                <SsfSelectMenu value={category} onValueChange={setCategory} options={categoryOptions} placeholder="Select a category" searchable width={modalWidth - 40} />
              )}
              {!categoriesQuery.isLoading && !categoriesQuery.isError && categoryOptions.length === 0 && <Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 4 }}>Add an active festival category before using bulk add.</Text>}
            </View>
            {effectiveGenderMode === 'both' && <View>
              <Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Gender</Text>
              <SsfSelectMenu value={gender} onValueChange={(value) => setGender(value as 'boys' | 'girls')} options={[{ label: 'Boys', value: 'boys' }, { label: 'Girls', value: 'girls' }]} width={modalWidth - 40} />
            </View>}
            <View>
              <Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Participants</Text>
              <TextInput
                accessibilityLabel="Participant names, one per line"
                value={namesText}
                onChangeText={setNamesText}
                placeholder="Enter one participant per line"
                multiline
                textAlignVertical="top"
                editable={!saving}
                style={{ minHeight: Math.min(150, height * 0.22), maxHeight: 190, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: ui.colors.border, color: ui.colors.text, backgroundColor: ui.colors.surface, fontSize: 14, outlineStyle: 'none' as any }}
              />
            <Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 4 }}>Blank lines are ignored. Names must be unique within this batch; the whole batch saves together.</Text>
            </View>
            {!!error && <Text accessibilityRole="alert" style={{ color: ui.colors.danger, fontSize: 12 }}>{error}</Text>}
          </ScrollView>
          <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: ui.colors.border, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
            <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={close} style={{ minHeight: 42, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: ui.colors.border }}><Text style={{ color: ui.colors.text, fontWeight: '700', fontSize: 12 }}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={saving || organisationsLoading || categoriesQuery.isLoading || teamOptions.length === 0 || categoryOptions.length === 0} onPress={save} style={{ minHeight: 42, minWidth: 138, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: ui.colors.primary, opacity: saving || organisationsLoading || categoriesQuery.isLoading || teamOptions.length === 0 || categoryOptions.length === 0 ? 0.6 : 1 }}>
              {saving ? <ActivityIndicator color={ui.colors.onPrimary} /> : <Text style={{ color: ui.colors.onPrimary, fontWeight: '700', fontSize: 12 }}>Add participants</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
