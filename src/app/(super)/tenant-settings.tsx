import React from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronUp, RefreshCw, Save, Shield, SlidersHorizontal } from 'lucide-react-native';
import { supabase } from '@/core/config/supabase';
import { useTenantFeatures, DEFAULT_TENANT_FEATURE_SETTINGS, type TenantFeatureSettings, type TenantModuleKey, type TeamPortalSection, type PublicPageSection } from '@/core/hooks/useTenantFeatures';
import { useChestNumberOrder } from '@/core/hooks/useChestNumberOrder';
import { Button } from '@/components/ui/shadcn/button';

const C = { bg: '#F4F7F7', surface: '#FFFFFF', border: '#DCE5E4', primary: '#0F766E', primarySoft: '#E5F4F1', text: '#173331', muted: '#607573', danger: '#B42318', green: '#15803D', amber: '#A16207' };

type Festival = {
  id: string; festival_year: number | null; level: string | null; custom_name: string | null;
  is_active: boolean; festival_template: string; chest_number_template: 'team' | 'category';
  chest_number_category_range: 100 | 1000;
};
type Talent = { id: string; item_code: string | null; item_name_en: string | null; item_name_ml: string | null };
type TenantControlData = { tenant: { id: string; name: string; festival_template: string; organisation_id: string | null; organisation_name: string | null }; settings: TenantFeatureSettings; festivals: Festival[] };
type AuditRow = { id: string; action: string; table_name: string; old_value: any; new_value: any; created_at: string };

const moduleRows: { key: TenantModuleKey; title: string; description: string }[] = [
  { key: 'team_leader_management', title: 'Team Leader Management', description: 'Admin tools for teams, team leader accounts, and assignments.' },
  { key: 'team_leader_portal', title: 'Team Leader Portal', description: 'Authenticated portal used by team leaders.' },
  { key: 'smart_announcer', title: 'Smart Announcer', description: 'Announcer queue and token based announcer portal.' },
  { key: 'stage_management', title: 'Stage Management', description: 'Stage operations and venue portal.' },
  { key: 'judge_portal', title: 'Judge Portal', description: 'Judge access links and mark submission.' },
  { key: 'direct_entry', title: 'Direct Entry', description: 'Admin entry and publication of marks without judge portal submissions.' },
  { key: 'public_page', title: 'Public Page', description: 'Public schedule, results, participant results, and media page.' },
  { key: 'public_leaderboard', title: 'Public Leaderboard', description: 'Public unit and individual leaderboard views.' },
  { key: 'poster_studio', title: 'Poster Studio', description: 'Create and manage public result posters.' },
  { key: 'media_center', title: 'Media Center', description: 'Tenant media library and public media views.' },
];

const teamSections: { key: TeamPortalSection; title: string }[] = [
  { key: 'my_team', title: 'My Team' }, { key: 'schedule', title: 'Schedule' },
  { key: 'results', title: 'Results' }, { key: 'participants', title: 'Participants' },
  { key: 'programs', title: 'Programs' }, { key: 'announcements', title: 'Announcements' },
];
const publicSections: { key: PublicPageSection; title: string }[] = [
  { key: 'schedule', title: 'Schedule' }, { key: 'results', title: 'Results and rankings' },
  { key: 'participant_results', title: 'Participant results' }, { key: 'media', title: 'Media' },
];

const cloneSettings = (settings: TenantFeatureSettings): TenantFeatureSettings => ({
  ...settings, modules: { ...settings.modules },
  sections: {
    team_leader_portal: { ...settings.sections.team_leader_portal },
    public_page: { ...settings.sections.public_page },
  },
});

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <View style={{ backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 14 }}>
    <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{title}</Text>
    {description ? <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 14 }}>{description}</Text> : null}
    {children}
  </View>;
}

function LabeledInput({ label, value, onChangeText, placeholder, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  return <View style={{ flex: 1, minWidth: 180, marginBottom: 8 }}>
    <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 5 }}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} maxLength={160} multiline={multiline}
      style={{ minHeight: multiline ? 68 : 42, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, color: C.text, backgroundColor: '#FAFCFC' }} />
  </View>;
}

function ToggleRow({ title, description, value, onValueChange, disabled = false }: { title: string; description?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  return <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EDF1F1' }}>
    <View style={{ flex: 1 }}><Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{title}</Text>
      {description ? <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 2 }}>{description}</Text> : null}</View>
    <Switch value={value} disabled={disabled} onValueChange={onValueChange} trackColor={{ false: '#D5DEDD', true: '#99D5CA' }} thumbColor={value ? C.primary : '#FFFFFF'} />
  </View>;
}

function confirmOperation(title: string, message: string, run: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) run();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Continue', style: 'destructive', onPress: run },
  ]);
}

export default function SuperTenantSettings() {
  const params = useLocalSearchParams<{ tenant_id?: string; tenant_name?: string }>();
  const tenantId = Array.isArray(params.tenant_id) ? params.tenant_id[0] : params.tenant_id;
  const router = useRouter();
  const cache = useQueryClient();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const controlQuery = useQuery({
    queryKey: ['superadmin', 'tenant-control', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('super_get_tenant_control_data', { p_tenant_id: tenantId });
      if (error) throw new Error(error.message);
      return data as TenantControlData;
    },
  });
  const auditQuery = useQuery({
    queryKey: ['superadmin', 'tenant-audit', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('super_list_tenant_audit_logs', { p_tenant_id: tenantId, p_limit: 80 });
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditRow[];
    },
  });

  const [tenantName, setTenantName] = React.useState('');
  const [originalTenantName, setOriginalTenantName] = React.useState('');
  const [organisationName, setOrganisationName] = React.useState('');
  const [originalOrganisationName, setOriginalOrganisationName] = React.useState('');
  const [draft, setDraft] = React.useState<TenantFeatureSettings>(() => cloneSettings(DEFAULT_TENANT_FEATURE_SETTINGS));
  const [selectedFestivalId, setSelectedFestivalId] = React.useState('');
  const [selectedTalentId, setSelectedTalentId] = React.useState('');
  const [festivalName, setFestivalName] = React.useState('');
  const [originalFestivalName, setOriginalFestivalName] = React.useState('');
  const [talentNameEn, setTalentNameEn] = React.useState('');
  const [talentNameMl, setTalentNameMl] = React.useState('');
  const [originalTalentNameEn, setOriginalTalentNameEn] = React.useState('');
  const [originalTalentNameMl, setOriginalTalentNameMl] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const data = controlQuery.data;
    if (!data) return;
    setTenantName(data.tenant.name);
    setOriginalTenantName(data.tenant.name);
    setOrganisationName(data.tenant.organisation_name ?? '');
    setOriginalOrganisationName(data.tenant.organisation_name ?? '');
    setDraft(cloneSettings(data.settings));
    setSelectedFestivalId((current) => current || data.festivals.find((item) => item.is_active)?.id || data.festivals[0]?.id || '');
  }, [controlQuery.data]);

  const selectedFestival = controlQuery.data?.festivals.find((item) => item.id === selectedFestivalId) ?? null;
  React.useEffect(() => {
    setFestivalName(selectedFestival?.custom_name ?? '');
    setOriginalFestivalName(selectedFestival?.custom_name ?? '');
  }, [selectedFestivalId, selectedFestival?.custom_name]);

  const talentQuery = useQuery({
    queryKey: ['superadmin', 'tenant-talents', tenantId, selectedFestivalId],
    enabled: !!tenantId && !!selectedFestivalId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('super_get_tenant_talents', { p_tenant_id: tenantId, p_festival_id: selectedFestivalId });
      if (error) throw new Error(error.message);
      return (data ?? []) as Talent[];
    },
  });
  const selectedTalent = talentQuery.data?.find((item) => item.id === selectedTalentId) ?? null;
  React.useEffect(() => {
    if (!talentQuery.data?.length) { setSelectedTalentId(''); return; }
    setSelectedTalentId((current) => talentQuery.data!.some((item) => item.id === current) ? current : talentQuery.data![0].id);
  }, [talentQuery.data]);
  React.useEffect(() => {
    setTalentNameEn(selectedTalent?.item_name_en ?? '');
    setTalentNameMl(selectedTalent?.item_name_ml ?? '');
    setOriginalTalentNameEn(selectedTalent?.item_name_en ?? '');
    setOriginalTalentNameMl(selectedTalent?.item_name_ml ?? '');
  }, [selectedTalentId, selectedTalent?.item_name_en, selectedTalent?.item_name_ml]);

  const featureQuery = useTenantFeatures(tenantId);
  const savedRevision = controlQuery.data?.settings?.revision ?? featureQuery.settings.revision ?? 1;
  const settingsChanged = !!controlQuery.data && (
    JSON.stringify(draft.modules) !== JSON.stringify(controlQuery.data.settings.modules)
    || JSON.stringify(draft.sections) !== JSON.stringify(controlQuery.data.settings.sections)
  );

  const refreshControlData = async () => {
    await Promise.all([
      controlQuery.refetch(), auditQuery.refetch(),
      cache.invalidateQueries({ queryKey: ['superadmin', 'tenants'] }),
      cache.invalidateQueries({ queryKey: ['tenant-features', 'admin', tenantId] }),
      cache.invalidateQueries({ queryKey: ['tenant-features', 'public', tenantId] }),
    ]);
  };

  const saveTenantName = async () => {
    if (!tenantId || busy || !tenantName.trim()) return;
    setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.rpc('super_update_tenant_name', {
        p_tenant_id: tenantId, p_name: tenantName.trim(), p_expected_name: originalTenantName,
      });
      if (error) throw new Error(error.message);
      setTenantName(data); setOriginalTenantName(data); setNotice('Account name saved.');
      await refreshControlData();
    } catch (error: any) { setNotice(error?.message || 'Could not save the account name.'); }
    finally { setBusy(false); }
  };

  const saveOrganisationName = async () => {
    if (!tenantId || busy || !organisationName.trim()) return;
    setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.rpc('super_update_organisation_name', {
        p_tenant_id: tenantId, p_name: organisationName.trim(), p_expected_name: originalOrganisationName,
      });
      if (error) throw new Error(error.message);
      setOrganisationName(data); setOriginalOrganisationName(data); setNotice('Organisation name saved.');
      await refreshControlData();
    } catch (error: any) { setNotice(error?.message || 'Could not save the organisation name.'); }
    finally { setBusy(false); }
  };

  const saveFeatures = async () => {
    if (!tenantId || busy || !controlQuery.data) return;
    setBusy(true); setNotice('');
    try {
      const p_sections = {
        team_leader_portal: draft.sections.team_leader_portal,
        public_page: draft.sections.public_page,
      };
      const { data, error } = await supabase.rpc('super_update_tenant_modules', {
        p_tenant_id: tenantId, p_modules: draft.modules, p_sections, p_expected_revision: savedRevision,
      });
      if (error) throw new Error(error.message);
      const fresh = cloneSettings(data as TenantFeatureSettings);
      setDraft(fresh);
      cache.setQueryData(['superadmin', 'tenant-control', tenantId], { ...controlQuery.data, settings: fresh });
      setNotice('Portal settings saved. Existing sessions now follow these settings.');
      await refreshControlData();
    } catch (error: any) { setNotice(error?.message || 'Could not save portal settings.'); await controlQuery.refetch(); }
    finally { setBusy(false); }
  };

  const saveFestivalName = async () => {
    if (!tenantId || !selectedFestival || busy || !festivalName.trim()) return;
    setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.rpc('super_update_festival_name', {
        p_tenant_id: tenantId, p_festival_id: selectedFestival.id, p_name: festivalName.trim(), p_expected_name: originalFestivalName || null,
      });
      if (error) throw new Error(error.message);
      setFestivalName(data); setOriginalFestivalName(data); setNotice('Festival name saved.');
      await refreshControlData();
    } catch (error: any) { setNotice(error?.message || 'Could not save the festival name.'); }
    finally { setBusy(false); }
  };

  const saveTalentName = async () => {
    if (!tenantId || !selectedFestival || !selectedTalent || busy) return;
    setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.rpc('super_update_talent_name', {
        p_tenant_id: tenantId, p_festival_id: selectedFestival.id, p_item_id: selectedTalent.id,
        p_name_en: talentNameEn, p_name_ml: talentNameMl || null,
        p_expected_name_en: selectedTalent.item_name_en, p_expected_name_ml: selectedTalent.item_name_ml,
      });
      if (error) throw new Error(error.message);
      setTalentNameEn(data.item_name_en ?? ''); setTalentNameMl(data.item_name_ml ?? '');
      setOriginalTalentNameEn(data.item_name_en ?? ''); setOriginalTalentNameMl(data.item_name_ml ?? '');
      setNotice('Talent name saved.');
      await talentQuery.refetch(); await auditQuery.refetch();
    } catch (error: any) { setNotice(error?.message || 'Could not save the talent name.'); }
    finally { setBusy(false); }
  };

  const updateModule = (key: TenantModuleKey, value: boolean) => {
    setDraft((current) => ({
      ...current,
      modules: {
        ...current.modules,
        [key]: value,
        ...(key === 'team_leader_management' && !value ? { team_leader_portal: false } : {}),
      },
    }));
    setNotice('');
  };
  const updateTeamSection = (key: TeamPortalSection, value: boolean) => setDraft((current) => ({ ...current, sections: { ...current.sections, team_leader_portal: { ...current.sections.team_leader_portal, [key]: value } } }));
  const updatePublicSection = (key: PublicPageSection, value: boolean) => setDraft((current) => ({ ...current, sections: { ...current.sections, public_page: { ...current.sections.public_page, [key]: value } } }));

  if (!tenantId) return <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}><Text style={{ color: C.danger }}>Tenant ID is missing.</Text></View>;
  if (controlQuery.isLoading) return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={C.primary} /><Text style={{ color: C.muted, marginTop: 10 }}>Loading tenant control center…</Text></View>;
  if (controlQuery.error || !controlQuery.data) return <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, justifyContent: 'center' }}><Text style={{ color: C.danger, marginBottom: 12 }}>{controlQuery.error?.message || 'Tenant details are unavailable.'}</Text><Button variant="outline" onPress={() => { void controlQuery.refetch(); }}>Retry</Button></View>;

  const festivals = controlQuery.data.festivals;
  return <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ width: '100%', maxWidth: 1120, alignSelf: 'center', padding: compact ? 14 : 26, paddingBottom: 56 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to tenant accounts" onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}><ArrowLeft size={19} color={C.text} /></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={{ color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>SUPER USER · TENANT CONTROL CENTER</Text><Text style={{ color: C.text, fontSize: compact ? 21 : 27, fontWeight: '900' }}>{controlQuery.data.tenant.name}</Text></View>
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Shield size={20} color={C.primary} /></View>
    </View>

    <Panel title="Account name" description="This is the tenant account name. Organisation and festival display names remain separate.">
      <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10, alignItems: compact ? 'stretch' : 'flex-end' }}>
        <LabeledInput label="TENANT NAME" value={tenantName} onChangeText={setTenantName} placeholder="Account name" />
        <Button disabled={busy || !tenantName.trim() || tenantName.trim() === originalTenantName} loading={busy} onPress={() => { void saveTenantName(); }}><Save size={15} color="#FFFFFF" /> Save account name</Button>
      </View>
    </Panel>

    <Panel title="Organisation name" description="Updates the tenant’s root organisation display name and its dependent team labels.">
      {controlQuery.data.tenant.organisation_id ? <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10, alignItems: compact ? 'stretch' : 'flex-end' }}>
        <LabeledInput label="ROOT ORGANISATION NAME" value={organisationName} onChangeText={setOrganisationName} placeholder="Organisation name" />
        <Button disabled={busy || !organisationName.trim() || organisationName.trim() === originalOrganisationName} loading={busy} onPress={() => { void saveOrganisationName(); }}><Save size={15} color="#FFFFFF" /> Save organisation name</Button>
      </View> : <Text style={{ color: C.muted, fontSize: 12 }}>No root organisation is linked to this tenant.</Text>}
    </Panel>

    <Panel title="Festival and talent names" description="Names are scoped to this tenant and festival. The talent editor does not modify shared catalogue rows for other tenants.">
      <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>FESTIVAL</Text>
      {festivals.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>{festivals.map((festival) => <TouchableOpacity key={festival.id} onPress={() => setSelectedFestivalId(festival.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: selectedFestivalId === festival.id ? C.primarySoft : '#F6F8F8', borderWidth: 1, borderColor: selectedFestivalId === festival.id ? '#78BDB3' : C.border }}><Text style={{ color: selectedFestivalId === festival.id ? C.primary : C.text, fontSize: 12, fontWeight: '700' }}>{festival.custom_name || `${festival.festival_year ?? 'Festival'} · ${festival.level ?? ''}`}</Text></TouchableOpacity>)}</View> : <Text style={{ color: C.muted, marginBottom: 12 }}>No festivals are configured for this tenant.</Text>}
      {selectedFestival ? <>
        <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10, alignItems: compact ? 'stretch' : 'flex-end' }}>
          <LabeledInput label="FESTIVAL DISPLAY NAME" value={festivalName} onChangeText={setFestivalName} placeholder={`${selectedFestival.festival_year ?? ''} ${selectedFestival.level ?? 'Festival'}`} />
          <Button disabled={busy || !festivalName.trim() || festivalName.trim() === originalFestivalName} loading={busy} onPress={() => { void saveFestivalName(); }}>Save festival name</Button>
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: '#EDF1F1', marginTop: 8, paddingTop: 12 }}>
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>TALENT / ITEM</Text>
          {talentQuery.isLoading ? <ActivityIndicator color={C.primary} style={{ alignSelf: 'flex-start' }} /> : talentQuery.error ? <Text style={{ color: C.danger }}>{talentQuery.error.message}</Text> : !talentQuery.data?.length ? <Text style={{ color: C.muted, fontSize: 12 }}>No tenant-specific talents were found for this festival.</Text> : <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxHeight: 130, marginBottom: 10 }}>{talentQuery.data.map((item) => <TouchableOpacity key={item.id} onPress={() => setSelectedTalentId(item.id)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: selectedTalentId === item.id ? '#78BDB3' : C.border, backgroundColor: selectedTalentId === item.id ? C.primarySoft : '#F8FAFA' }}><Text style={{ color: selectedTalentId === item.id ? C.primary : C.text, fontSize: 11 }}>{item.item_code ? `${item.item_code} · ` : ''}{item.item_name_en || item.item_name_ml || 'Unnamed talent'}</Text></TouchableOpacity>)}</View>
            <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10, alignItems: compact ? 'stretch' : 'flex-end' }}>
              <LabeledInput label="ENGLISH NAME" value={talentNameEn} onChangeText={setTalentNameEn} placeholder="Talent name" />
              <LabeledInput label="MALAYALAM NAME" value={talentNameMl} onChangeText={setTalentNameMl} placeholder="പ്രതിഭയുടെ പേര്" />
              <Button disabled={busy || !talentNameEn.trim() || (talentNameEn === originalTalentNameEn && talentNameMl === originalTalentNameMl)} loading={busy} onPress={() => { void saveTalentName(); }}>Save talent</Button>
            </View>
          </>}
        </View>
      </> : null}
    </Panel>

    <Panel title="Portal and module access" description="Settings apply to this tenant only. Existing sessions and token based portal requests are checked on their next server request.">
      {moduleRows.map((item) => <ToggleRow key={item.key} title={item.title} description={item.description}
        value={draft.modules[item.key]} disabled={busy || (item.key === 'team_leader_portal' && !draft.modules.team_leader_management)}
        onValueChange={(value) => updateModule(item.key, value)} />)}
      {draft.modules.team_leader_portal && <View style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: '#F8FAFA', borderWidth: 1, borderColor: C.border }}>
        <Text style={{ color: C.text, fontWeight: '800', fontSize: 13, marginBottom: 4 }}>Team Leader Portal sections</Text>
        {teamSections.map((section) => <ToggleRow key={section.key} title={section.title} value={draft.sections.team_leader_portal[section.key]} disabled={busy} onValueChange={(value) => updateTeamSection(section.key, value)} />)}
      </View>}
      {draft.modules.public_page && <View style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: '#F8FAFA', borderWidth: 1, borderColor: C.border }}>
        <Text style={{ color: C.text, fontWeight: '800', fontSize: 13, marginBottom: 4 }}>Public Page sections</Text>
        {publicSections.map((section) => <ToggleRow key={section.key} title={section.title} value={draft.sections.public_page[section.key]} disabled={busy} onValueChange={(value) => updatePublicSection(section.key, value)} />)}
      </View>}
      {draft.modules.team_leader_management === false ? <Text style={{ color: C.amber, fontSize: 11, marginTop: 8 }}>Team Leader Management is off, so the Team Leader Portal is also turned off. Turning management back on will not turn the portal back on automatically.</Text> : null}
      <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <Text style={{ color: C.muted, fontSize: 11 }}>Revision {savedRevision} · optimistic conflict protection enabled</Text>
        <Button disabled={!settingsChanged || busy} loading={busy} onPress={() => { void saveFeatures(); }}><Save size={15} color="#FFFFFF" /> Save module settings</Button>
      </View>
    </Panel>

    <ChestControlPanel tenantId={tenantId} festivals={festivals} selectedFestival={selectedFestival} onNotice={setNotice} onRefresh={refreshControlData} compact={compact} />

    <Panel title="Recent Super User audit" description="Names, feature switches, and chest-number changes are recorded here.">
      {auditQuery.isLoading ? <ActivityIndicator color={C.primary} style={{ alignSelf: 'flex-start' }} /> : auditQuery.error ? <Text style={{ color: C.danger, fontSize: 12 }}>{auditQuery.error.message}</Text> : !auditQuery.data?.length ? <Text style={{ color: C.muted, fontSize: 12 }}>No Super User changes recorded yet.</Text> : auditQuery.data.map((row) => <View key={row.id} style={{ borderTopWidth: 1, borderTopColor: '#EDF1F1', paddingVertical: 9 }}>
        <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>{row.action.replaceAll('_', ' ')}</Text>
        <Text style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>{row.table_name} · {new Date(row.created_at).toLocaleString()}</Text>
      </View>)}
      <TouchableOpacity accessibilityRole="button" onPress={() => { void auditQuery.refetch(); }} style={{ marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}><RefreshCw size={13} color={C.primary} /><Text style={{ color: C.primary, fontSize: 11, fontWeight: '700' }}>Refresh audit</Text></TouchableOpacity>
    </Panel>

    {!!notice && <View accessibilityRole="alert" style={{ marginTop: 2, padding: 13, borderRadius: 11, backgroundColor: notice.toLowerCase().includes('could not') || notice.toLowerCase().includes('error') ? '#FEF2F2' : C.primarySoft, borderWidth: 1, borderColor: C.border }}><Text style={{ color: notice.toLowerCase().includes('could not') || notice.toLowerCase().includes('error') ? C.danger : C.primary, fontSize: 12 }}>{notice}</Text></View>}
  </ScrollView>;
}

function ChestControlPanel({ tenantId, festivals, selectedFestival, onNotice, onRefresh, compact }: { tenantId: string; festivals: Festival[]; selectedFestival: Festival | null; onNotice: (value: string) => void; onRefresh: () => Promise<void>; compact: boolean }) {
  const cache = useQueryClient();
  const [template, setTemplate] = React.useState<'team' | 'category'>('category');
  const [range, setRange] = React.useState<100 | 1000>(100);
  const [teamIds, setTeamIds] = React.useState<string[]>([]);
  const [categoryCodes, setCategoryCodes] = React.useState<string[]>([]);
  const [categoryOrderEnabled, setCategoryOrderEnabled] = React.useState(false);
  const [unlockCode, setUnlockCode] = React.useState('');
  const [chestBusy, setChestBusy] = React.useState(false);
  const festivalId = selectedFestival?.id ?? '';
  const { query, save, lock, regenerate } = useChestNumberOrder(festivalId);
  const state = query.data;

  React.useEffect(() => {
    if (!selectedFestival) return;
    setTemplate(selectedFestival.chest_number_template ?? 'category');
    setRange(selectedFestival.chest_number_category_range ?? 100);
  }, [selectedFestival, selectedFestival?.id, selectedFestival?.chest_number_template, selectedFestival?.chest_number_category_range]);
  React.useEffect(() => {
    if (!state) return;
    setTeamIds(state.teams.map((team) => team.id));
    setCategoryCodes(state.categories.map((category) => category.code));
    setCategoryOrderEnabled(state.category_order_enabled);
  }, [state, state?.revision, state?.teams, state?.categories, state?.category_order_enabled]);

  const moveInList = (values: string[], setValues: (next: string[]) => void, index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    const next = [...values]; [next[index], next[target]] = [next[target], next[index]]; setValues(next);
  };
  const configChanged = !!selectedFestival && (template !== selectedFestival.chest_number_template || range !== selectedFestival.chest_number_category_range);
  const orderChanged = !!state && (teamIds.join('|') !== state.teams.map((team) => team.id).join('|')
    || categoryCodes.join('|') !== state.categories.map((category) => category.code).join('|')
    || categoryOrderEnabled !== state.category_order_enabled);

  const saveChestConfiguration = () => {
    if (!selectedFestival || !configChanged || chestBusy) return;
    confirmOperation('Apply chest-number settings?', `This will regenerate chest numbers for the selected festival using the ${template} template and ${range} range. Existing numbers will be reassigned. The change is audited and can be reviewed in the control history.`, () => {
      setChestBusy(true);
      void (async () => {
        try {
          const { error } = await supabase.rpc('super_update_chest_settings', {
            p_tenant_id: tenantId, p_festival_id: selectedFestival.id,
            p_expected_template: selectedFestival.chest_number_template,
            p_expected_range: selectedFestival.chest_number_category_range,
            p_template: template, p_range: range,
          });
          if (error) throw new Error(error.message);
          onNotice('Chest template and range saved. Existing chest numbers were regenerated.');
          await Promise.all([onRefresh(), query.refetch(), cache.invalidateQueries({ queryKey: ['chest-number-order'] })]);
        } catch (error: any) { onNotice(error?.message || 'Could not update chest settings.'); }
        finally { setChestBusy(false); }
      })();
    });
  };

  const saveOrder = () => {
    if (!state || !orderChanged || chestBusy || state.locked) return;
    confirmOperation('Save chest-number order?', 'The saved ordering will reassign existing chest numbers for this festival. The server checks the current revision and team list before it writes.', () => {
      setChestBusy(true);
      void save.mutateAsync({ state, teamIds, categoryCodes, enabled: categoryOrderEnabled })
        .then(() => onNotice('Chest-number order saved and participant numbers regenerated.'))
        .catch((error: any) => onNotice(error?.message || 'Could not save chest-number order.'))
        .finally(() => setChestBusy(false));
    });
  };

  const regenerateAll = () => {
    if (!state || chestBusy || state.locked) return;
    confirmOperation('Regenerate all chest numbers?', 'Every participant chest number in the selected festival will be reassigned using the current saved template and order.', () => {
      setChestBusy(true);
      void regenerate.mutateAsync()
        .then((result: any) => onNotice(`Regenerated ${result?.participant_count ?? 0} chest numbers.`))
        .catch((error: any) => onNotice(error?.message || 'Could not regenerate chest numbers.'))
        .finally(() => setChestBusy(false));
    });
  };

  const toggleLock = (locked: boolean) => {
    if (!state || chestBusy) return;
    if (!locked && unlockCode.trim().toLowerCase() !== tenantId.toLowerCase()) {
      onNotice('Enter this tenant’s ID to unlock chest numbers.'); return;
    }
    const run = () => {
      setChestBusy(true);
      void lock.mutateAsync({ state, locked, code: locked ? undefined : unlockCode })
        .then(() => { setUnlockCode(''); onNotice(locked ? 'Chest numbers are locked.' : 'Chest numbers unlocked. Existing order and numbers remain intact.'); })
        .catch((error: any) => onNotice(error?.message || 'Could not change chest-number lock.'))
        .finally(() => setChestBusy(false));
    };
    if (locked) confirmOperation('Lock chest-number settings?', 'Reordering and regeneration will require unlocking with the tenant ID.', run);
    else run();
  };

  return <Panel title="Chest-number control" description="Choose the festival, numbering template, 100/1000 range, team and category order, and final lock state. Number-changing operations require confirmation.">
    {festivals.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>{festivals.map((festival) => <Text key={festival.id} style={{ color: festival.id === festivalId ? C.primary : C.muted, backgroundColor: festival.id === festivalId ? C.primarySoft : '#F4F7F7', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, fontSize: 10, fontWeight: '700' }}>{festival.custom_name || `${festival.festival_year ?? ''} ${festival.level ?? 'Festival'}`}{festival.id === festivalId ? ' · selected above' : ''}</Text>)}</View> : null}
    {!festivalId ? <Text style={{ color: C.muted, fontSize: 12 }}>Create a festival before changing chest-number settings.</Text> : query.isLoading && !state ? <ActivityIndicator color={C.primary} style={{ alignSelf: 'flex-start' }} /> : query.error && !state ? <View><Text style={{ color: C.danger, fontSize: 12, marginBottom: 8 }}>{query.error.message}</Text><Button variant="outline" onPress={() => { void query.refetch(); }}>Retry chest settings</Button></View> : state ? <>
      <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1 }}><Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>NUMBERING TEMPLATE</Text><View style={{ flexDirection: 'row', gap: 7 }}>{(['category','team'] as const).map((value) => <TouchableOpacity key={value} onPress={() => { setTemplate(value); if (value === 'category' && range === 1000) setRange(100); }} style={{ borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: template === value ? '#78BDB3' : C.border, backgroundColor: template === value ? C.primarySoft : '#FFF' }}><Text style={{ color: template === value ? C.primary : C.text, fontWeight: '700', fontSize: 12 }}>{value === 'team' ? 'Team' : 'Category'}</Text></TouchableOpacity>)}</View></View>
        <View style={{ flex: 1 }}><Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>RANGE</Text><View style={{ flexDirection: 'row', gap: 7 }}>{([100,1000] as const).map((value) => { const unavailable = value === 1000 && template !== 'team'; return <TouchableOpacity key={value} disabled={unavailable} onPress={() => setRange(value)} style={{ opacity: unavailable ? 0.4 : 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: range === value ? '#78BDB3' : C.border, backgroundColor: range === value ? C.primarySoft : '#FFF' }}><Text style={{ color: range === value ? C.primary : C.text, fontWeight: '700', fontSize: 12 }}>{value}</Text></TouchableOpacity>; })}</View></View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Button disabled={!configChanged || chestBusy || state.locked} loading={chestBusy} onPress={saveChestConfiguration}><Save size={14} color="#FFF" /> Save template and range</Button>
        {state.locked ? <Button variant="outline" disabled={chestBusy} onPress={() => toggleLock(false)}>Unlock</Button> : <>
          <Button variant="outline" disabled={chestBusy || !!state.locked} onPress={() => toggleLock(true)}>Final lock</Button>
          <Button variant="outline" disabled={chestBusy || !!state.locked} onPress={regenerateAll}><RefreshCw size={14} color={C.primary} /> Regenerate all</Button>
        </>}
      </View>
      {state.locked ? <View style={{ flexDirection: compact ? 'column' : 'row', gap: 8, alignItems: compact ? 'stretch' : 'center', backgroundColor: '#FFF8E7', borderColor: '#F4D693', borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 12 }}>
        <View style={{ flex: 1 }}><Text style={{ color: C.amber, fontSize: 12, fontWeight: '800' }}>Chest numbers are locked</Text><Text style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>Enter the tenant ID to unlock. The existing numbers are retained.</Text></View>
        <TextInput accessibilityLabel="Tenant ID unlock code" value={unlockCode} onChangeText={setUnlockCode} autoCapitalize="none" autoCorrect={false} placeholder="Tenant ID" style={{ minWidth: compact ? undefined : 220, minHeight: 40, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, color: C.text, backgroundColor: '#FFF' }} />
        <Button disabled={chestBusy || !unlockCode.trim()} onPress={() => toggleLock(false)}>Unlock with tenant ID</Button>
      </View> : null}
      {state.template === 'team' ? <>
        <Text style={{ color: C.text, fontSize: 12, fontWeight: '800', marginBottom: 6 }}>Team order</Text>
        {teamIds.map((id, index) => { const item = state.teams.find((team) => team.id === id); if (!item) return null; return <View key={id} style={{ minHeight: 42, borderTopWidth: 1, borderTopColor: '#EDF1F1', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ width: 25, color: C.primary, fontWeight: '800', fontSize: 11 }}>{index + 1}</Text><Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: 12 }}>{item.name}</Text><Text style={{ color: C.muted, fontSize: 10 }}>{item.total} participants</Text>
          <TouchableOpacity accessibilityLabel={`Move ${item.name} up`} disabled={state.locked || index === 0} onPress={() => moveInList(teamIds, setTeamIds, index, -1)} style={{ padding: 5, opacity: index === 0 ? 0.35 : 1 }}><ChevronUp size={16} color={C.primary} /></TouchableOpacity>
          <TouchableOpacity accessibilityLabel={`Move ${item.name} down`} disabled={state.locked || index === teamIds.length - 1} onPress={() => moveInList(teamIds, setTeamIds, index, 1)} style={{ padding: 5, opacity: index === teamIds.length - 1 ? 0.35 : 1 }}><ChevronDown size={16} color={C.primary} /></TouchableOpacity>
        </View>; })}
      </> : <Text style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>Category numbering is active. The existing category assignments will be retained unless the template or range is changed.</Text>}
      {state.categories?.length ? <View style={{ marginTop: 10 }}>
        <ToggleRow title="Category order within each team" description="Use one shared category order for team numbering." value={categoryOrderEnabled} disabled={state.locked} onValueChange={setCategoryOrderEnabled} />
        {categoryOrderEnabled ? categoryCodes.map((code, index) => { const item = state.categories.find((category) => category.code === code); if (!item) return null; return <View key={code} style={{ minHeight: 38, borderTopWidth: 1, borderTopColor: '#EDF1F1', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ width: 25, color: C.primary, fontWeight: '800', fontSize: 11 }}>{index + 1}</Text><Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: 12 }}>{item.name}</Text><TouchableOpacity disabled={state.locked || index === 0} onPress={() => moveInList(categoryCodes, setCategoryCodes, index, -1)} style={{ padding: 5, opacity: index === 0 ? 0.35 : 1 }}><ChevronUp size={16} color={C.primary} /></TouchableOpacity><TouchableOpacity disabled={state.locked || index === categoryCodes.length - 1} onPress={() => moveInList(categoryCodes, setCategoryCodes, index, 1)} style={{ padding: 5, opacity: index === categoryCodes.length - 1 ? 0.35 : 1 }}><ChevronDown size={16} color={C.primary} /></TouchableOpacity>
        </View>; }) : null}
      </View> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <Button disabled={!orderChanged || chestBusy || state.locked} loading={save.isPending || chestBusy} onPress={saveOrder}><SlidersHorizontal size={14} color="#FFF" /> Save order</Button>
        {orderChanged ? <Text style={{ color: C.amber, fontSize: 10 }}>Preview only until saved. Saving reassigns existing numbers.</Text> : <Text style={{ color: C.muted, fontSize: 10 }}>Revision {state.revision} · {state.teams.length} teams · {state.range} slots per range</Text>}
      </View>
    </> : null}
  </Panel>;
}
