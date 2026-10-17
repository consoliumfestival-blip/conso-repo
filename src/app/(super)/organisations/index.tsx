import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSuperAdmin } from '../../../core/hooks/useSuperAdmin';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Layers,
  ChevronRight,
  Building2,
  Map,
  GitBranch,
  Landmark,
  Flag,
  X,
  RefreshCw,
} from 'lucide-react-native';

// ─── Theme tokens ────────────────────────────────────────────────────
const C = {
  bg: '#0B1524',
  surface: '#111E35',
  border: '#1E3A5F',
  accent: '#FBBF24',
  accentBg: 'rgba(251,191,36,0.10)',
  text: '#E2E8F0',
  muted: '#475569',
  danger: '#F87171',
  dangerBg: 'rgba(239,68,68,0.10)',
  green: '#34D399',
  greenBg: 'rgba(52,211,153,0.10)',
  purple: '#818CF8',
  purpleBg: 'rgba(129,140,248,0.10)',
};

// ─── Types ───────────────────────────────────────────────────────────
type OrgType = 'unit' | 'sector' | 'division' | 'district' | 'state';

interface Org {
  id: string;
  name: string;
  org_type: OrgType;
  parent_id: string | null;
  created_at?: string;
}

// ─── Org Type Config ─────────────────────────────────────────────────
const ORG_TYPE_CONFIG: Record<OrgType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  unit: {
    label: 'Unit',
    icon: <Building2 size={16} color="#FBBF24" />,
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.10)',
  },
  sector: {
    label: 'Sector',
    icon: <Map size={16} color="#34D399" />,
    color: '#34D399',
    bg: 'rgba(52,211,153,0.10)',
  },
  division: {
    label: 'Division',
    icon: <GitBranch size={16} color="#818CF8" />,
    color: '#818CF8',
    bg: 'rgba(129,140,248,0.10)',
  },
  district: {
    label: 'District',
    icon: <Landmark size={16} color="#EC4899" />,
    color: '#EC4899',
    bg: 'rgba(236,72,153,0.10)',
  },
  state: {
    label: 'State',
    icon: <Flag size={16} color="#A855F7" />,
    color: '#A855F7',
    bg: 'rgba(168,85,247,0.10)',
  },
} as const;

const DEFAULT_ORG_CONFIG = { label: 'Other', icon: <Layers size={16} color="#94A3B8" />, color: '#94A3B8', bg: 'rgba(148,163,184,0.10)' };

const getOrgConfig = (type: string) =>
  ORG_TYPE_CONFIG[type as OrgType] ?? DEFAULT_ORG_CONFIG;

// ─── Add Modal ───────────────────────────────────────────────────────
function AddOrgModal({
  visible,
  onClose,
  onAdded,
  parentOrgs,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
  parentOrgs: Org[];
}) {
  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState<OrgType>('unit');
  const [parentId, setParentId] = useState<string | null>(null);
  
  const { useCreateGlobalOrganisation } = useSuperAdmin();
  const createMutation = useCreateGlobalOrganisation();

  const reset = () => {
    setName('');
    setOrgType('unit');
    setParentId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Platform.OS === 'web'
        ? window.alert('Please enter an organisation name.')
        : Alert.alert('Validation', 'Please enter an organisation name.');
      return;
    }
    // Require parent for non-root types
    if (orgType !== 'state' && !parentId) {
      const parentLabel = orgType === 'unit' ? 'Sector'
        : orgType === 'sector' ? 'Division'
        : orgType === 'division' ? 'District'
        : 'State';
      Platform.OS === 'web'
        ? window.alert(`Please select a parent ${parentLabel}.`)
        : Alert.alert('Validation', `Please select a parent ${parentLabel}.`);
      return;
    }
    try {
      const insertPayload = {
        name: name.trim(),
        org_type: orgType,
        parent_id: orgType === 'state' ? null : parentId,
      };
      
      await createMutation.mutateAsync(insertPayload);
      reset();
      onAdded();
      onClose();
    } catch (error: any) {
      Platform.OS === 'web'
        ? window.alert(`Error: ${error.message}`)
        : Alert.alert('Error', error.message);
    }
  };

  const eligibleParents = parentOrgs.filter((o) => {
    if (orgType === 'unit') return o.org_type === 'sector';
    if (orgType === 'sector') return o.org_type === 'division';
    if (orgType === 'division') return o.org_type === 'district';
    if (orgType === 'district') return o.org_type === 'state';
    return false;
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}>
        <Animated.View
          entering={FadeInUp.duration(300)}
          style={{
            backgroundColor: C.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 24,
            borderTopWidth: 1,
            borderColor: C.border,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ color: C.text, fontFamily: 'Poppins_900Black', fontSize: 20 }}>
              New Organisation
            </Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} style={{ padding: 6 }}>
              <X size={22} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Name input */}
          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. North Zone"
            placeholderTextColor={C.muted}
            style={{
              backgroundColor: C.bg,
              color: C.text,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: C.border,
              padding: 14,
              fontFamily: 'Poppins_400Regular',
              fontSize: 15,
              marginBottom: 20,
            }}
          />

          {/* Type selector */}
          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Type
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            {(['unit', 'sector', 'division', 'district', 'state'] as OrgType[]).map((t) => {
              const cfg = getOrgConfig(t);
               const active = orgType === t;
               return (
                 <TouchableOpacity
                   key={t}
                   onPress={() => { setOrgType(t); setParentId(null); }}
                   style={{
                     flex: 1,
                     paddingVertical: 10,
                     borderRadius: 12,
                     borderWidth: 1,
                     borderColor: active ? cfg.color : C.border,
                     backgroundColor: active ? cfg.bg : C.bg,
                    alignItems: 'center',
                  }}
                >
                  {cfg.icon}
                  <Text style={{ color: active ? cfg.color : C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, marginTop: 4 }}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Parent selector (for sector/division) */}
          {orgType !== 'state' && (
            <>
              <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                Parent {orgType === 'unit' ? 'Sector' : orgType === 'sector' ? 'Division' : orgType === 'division' ? 'District' : 'State'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {eligibleParents.length === 0 ? (
                  <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 13, paddingVertical: 10 }}>
                    No eligible parent origin found. Create one first.
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {eligibleParents.map((p) => {
                      const active = parentId === p.id;
                      const cfg = getOrgConfig(p.org_type);
                      return (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => setParentId(p.id)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: active ? cfg.color : C.border,
                            backgroundColor: active ? cfg.bg : C.bg,
                          }}
                        >
                          <Text style={{ color: active ? cfg.color : C.muted, fontFamily: 'Poppins_700Bold', fontSize: 12 }}>
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </>
          )}

          {/* Save button */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={createMutation.isPending}
            style={{
              backgroundColor: C.accent,
              borderRadius: 14,
              padding: 16,
              alignItems: 'center',
              opacity: createMutation.isPending ? 0.6 : 1,
            }}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color={C.bg} />
            ) : (
              <Text style={{ color: C.bg, fontFamily: 'Poppins_900Black', fontSize: 15 }}>
                Create Organisation
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────
export default function OrganisationsManager() {
  const router = useRouter();
  
  const { useGlobalOrganisations, useDeleteGlobalOrganisation } = useSuperAdmin();
  const { data: orgsData, isLoading: loading, refetch } = useGlobalOrganisations<Org>();
  const deleteMutation = useDeleteGlobalOrganisation();
  
  const orgs = (orgsData || []).map((o) => ({ ...o, org_type: (String(o.org_type ?? '').trim().toLowerCase() || 'unit') as OrgType }));

  const [showModal, setShowModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<OrgType | 'all'>('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchOrgs = () => refetch();

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const handleDelete = async (org: Org) => {
    const confirm = Platform.OS === 'web'
      ? window.confirm(`Delete "${org.name}"? This cannot be undone.`)
      : await new Promise<boolean>((res) =>
          Alert.alert('Delete Organisation', `Delete "${org.name}"? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel', onPress: () => res(false) },
            { text: 'Delete', style: 'destructive', onPress: () => res(true) },
          ])
        );
    if (!confirm) return;

    try {
      setDeleting(org.id);
      await deleteMutation.mutateAsync(org.id);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setDeleting(null);
    }
  };

  const filtered = activeFilter === 'all' ? orgs : orgs.filter((o) => o.org_type === activeFilter);

  // Build parent name map for display
  const parentMap = Object.fromEntries(orgs.map((o) => [o.id, o.name]));

  const counts: Record<OrgType, number> = { unit: 0, sector: 0, division: 0, district: 0, state: 0 };
  orgs.forEach((o) => { if (o.org_type in counts) counts[o.org_type]++; });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Header ── */}
      <Animated.View
        entering={FadeInDown.duration(500)}
        style={{
          paddingTop: 56,
          paddingBottom: 20,
          paddingHorizontal: 20,
          backgroundColor: C.surface,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                padding: 10,
                marginRight: 12,
                backgroundColor: C.bg,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <ArrowLeft size={20} color={C.text} />
            </TouchableOpacity>
            <View>
              <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>
                Global
              </Text>
              <Text style={{ color: C.text, fontFamily: 'Poppins_900Black', fontSize: 22, lineHeight: 26 }}>
                Hierarchy
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={fetchOrgs}
              style={{
                padding: 10,
                backgroundColor: C.bg,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <RefreshCw size={18} color={C.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowModal(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: C.accent,
                borderRadius: 12,
                gap: 6,
              }}
            >
              <Plus size={18} color={C.bg} />
              <Text style={{ color: C.bg, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Count pills ── */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {(['unit', 'sector', 'division', 'district', 'state'] as OrgType[]).map((t) => {
            const cfg = getOrgConfig(t);
            return (
              <View
                key={t}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: cfg.bg,
                  borderRadius: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: cfg.color + '40',
                  gap: 5,
                }}
              >
                {cfg.icon}
                <Text style={{ color: cfg.color, fontFamily: 'Poppins_700Bold', fontSize: 12 }}>
                  {counts[t]} {cfg.label}s
                </Text>
              </View>
            );
          })}
        </View>
      </Animated.View>

      {/* ── Filter tabs ── */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 20,
          paddingVertical: 12,
          gap: 8,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        {(['all', 'unit', 'sector', 'division', 'district', 'state'] as const).map((f) => {
          const active = activeFilter === f;
          const cfg = f !== 'all' ? getOrgConfig(f) : null;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setActiveFilter(f)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: active ? (cfg?.color ?? C.accent) : C.border,
                backgroundColor: active ? (cfg?.bg ?? C.accentBg) : 'transparent',
              }}
            >
              <Text style={{ color: active ? (cfg?.color ?? C.accent) : C.muted, fontFamily: 'Poppins_700Bold', fontSize: 12 }}>
                {f === 'all' ? 'All' : cfg!.label + 's'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── List ── */}
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 14, marginTop: 12 }}>
              Loading hierarchy…
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <Animated.View entering={FadeInUp.duration(400)} style={{ alignItems: 'center', paddingTop: 60 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 24,
                backgroundColor: C.surface,
                borderWidth: 1,
                borderColor: C.border,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Layers size={36} color={C.border} />
            </View>
            <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 16, marginBottom: 6 }}>
              No organisations found
            </Text>
            <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 13, textAlign: 'center' }}>
              Tap the "Add" button to create your first organisational unit.
            </Text>
          </Animated.View>
        ) : (
          filtered.map((org, i) => {
            const cfg = getOrgConfig(org.org_type);
            const isDeleting = deleting === org.id;
            return (
              <Animated.View
                key={org.id}
                entering={FadeInUp.duration(400).delay(i * 40).springify()}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: C.surface,
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  {/* Type icon box */}
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: cfg.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 14,
                      borderWidth: 1,
                      borderColor: cfg.color + '40',
                    }}
                  >
                    {org.org_type === 'unit' && <Building2 size={20} color={cfg.color} />}
                    {org.org_type === 'sector' && <Map size={20} color={cfg.color} />}
                    {org.org_type === 'division' && <GitBranch size={20} color={cfg.color} />}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 15 }}>
                      {org.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
                      <View
                        style={{
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 6,
                          backgroundColor: cfg.bg,
                        }}
                      >
                        <Text style={{ color: cfg.color, fontFamily: 'Poppins_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
                          {cfg.label}
                        </Text>
                      </View>
                      {org.parent_id && parentMap[org.parent_id] && (
                        <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 12 }}>
                          › {parentMap[org.parent_id]}
                        </Text>
                      )}
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleDelete(org)}
                    disabled={isDeleting}
                    style={{
                      padding: 8,
                      backgroundColor: C.dangerBg,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(239,68,68,0.2)',
                      opacity: isDeleting ? 0.5 : 1,
                    }}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color={C.danger} />
                    ) : (
                      <Trash2 size={16} color={C.danger} />
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* ── Add Modal ── */}
      <AddOrgModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onAdded={fetchOrgs}
        parentOrgs={orgs}
      />
    </View>
  );
}
