import React, { useState, useEffect } from 'react';
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
  Clipboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSuperAdmin } from '../../../core/hooks/useSuperAdmin';
import type { FestivalTemplate } from '../../../lib/repositories/provisioningRepository';
import { FEATURE_FLAGS } from '../../../core/config/features';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft, Users, ShieldCheck, ShieldAlert, X, RefreshCw,
  Building2, Map, GitBranch, Landmark, Flag, Layers,
  Mail, KeyRound, Info, ChevronRight, Copy, ExternalLink,
} from 'lucide-react-native';

const C = {
  bg: '#0B1524', surface: '#111E35', border: '#1E3A5F',
  accent: '#FBBF24', accentBg: 'rgba(251,191,36,0.10)',
  text: '#E2E8F0', muted: '#475569', danger: '#F87171',
  dangerBg: 'rgba(239,68,68,0.10)', green: '#34D399',
  greenBg: 'rgba(52,211,153,0.10)', purple: '#818CF8',
  purpleBg: 'rgba(129,140,248,0.10)',
};

type OrgType = 'unit' | 'sector' | 'division' | 'district' | 'state';

interface Org {
  id: string;
  name: string;
  org_type: OrgType;
  tenant_id: string | null;
  admin_email?: string | null;
  access_disabled?: boolean;
}

const ORG_TYPE_CONFIG: Record<OrgType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  unit:     { label: 'Unit',     icon: <Building2 size={16} color="#FBBF24" />, color: '#FBBF24', bg: 'rgba(251,191,36,0.10)' },
  sector:   { label: 'Sector',   icon: <Map       size={16} color="#34D399" />, color: '#34D399', bg: 'rgba(52,211,153,0.10)' },
  division: { label: 'Division', icon: <GitBranch size={16} color="#818CF8" />, color: '#818CF8', bg: 'rgba(129,140,248,0.10)' },
  district: { label: 'District', icon: <Landmark  size={16} color="#EC4899" />, color: '#EC4899', bg: 'rgba(236,72,153,0.10)' },
  state:    { label: 'State',    icon: <Flag      size={16} color="#A855F7" />, color: '#A855F7', bg: 'rgba(168,85,247,0.10)' },
} as const;

const DEFAULT_ORG_CONFIG = { label: 'Other', icon: <Layers size={16} color="#94A3B8" />, color: '#94A3B8', bg: 'rgba(148,163,184,0.10)' };

const getOrgConfig = (type: string) =>
  ORG_TYPE_CONFIG[type as OrgType] ?? DEFAULT_ORG_CONFIG;

// ─── Detail Modal (for active tenants) ───────────────────────────────
function DetailModal({ visible, onClose, onComplete, org }: { 
  visible: boolean; 
  onClose: () => void; 
  onComplete: () => void; 
  org: Org | null 
}) {
  const [copied, setCopied]           = useState(false);
  const [copiedTenantId, setCopiedTenantId] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy]               = useState(false);
  const { useDisableTenantAccess, useEnableTenantAccess, useResetRootTenantCredential, useTenantLeaderboardAgentPrompt } = useSuperAdmin();
  const disableMutation = useDisableTenantAccess();
  const enableMutation = useEnableTenantAccess();
  const resetMutation = useResetRootTenantCredential();
  const promptQuery = useTenantLeaderboardAgentPrompt(org?.tenant_id);

  if (!org) return null;
  const cfg = getOrgConfig(org.org_type);
  const isDisabled = org.access_disabled === true;
  const prompt = promptQuery.data as any;
  const promptText = typeof prompt?.prompt_text === 'string' ? prompt.prompt_text : '';

  const handleCopy = () => {
    const text = `Email: ${org.admin_email ?? '—'}\nTenant ID: ${org.tenant_id ?? '—'}`;
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      Clipboard.setString(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyTenantId = () => {
    const text = org.tenant_id ?? '';
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(text).then(() => {
        setCopiedTenantId(true);
        setTimeout(() => setCopiedTenantId(false), 2000);
      });
    } else {
      Clipboard.setString(text);
      setCopiedTenantId(true);
      setTimeout(() => setCopiedTenantId(false), 2000);
    }
  };

  const handleCopyPrompt = async () => {
    if (!promptText || isDisabled) return;
    const copy = async () => {
      if (Platform.OS === 'web' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText);
      } else {
        Clipboard.setString(promptText);
      }
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2200);
    };
    try {
      await copy();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(`Unable to copy prompt: ${error?.message ?? 'clipboard unavailable'}`);
      else Alert.alert('Unable to copy prompt', error?.message ?? 'Clipboard unavailable');
    }
  };

  const handleOpenLogin = () => {
    if (Platform.OS === 'web') {
      const url = `${window.location.origin}`;
      window.open(url, '_blank');
    }
  };

  const performDisable = async () => {
    try {
      setBusy(true);
      await disableMutation.mutateAsync({ orgId: org.id });
      if (Platform.OS === 'web') window.alert('Tenant access disabled. Festival data and history are preserved.');
      else Alert.alert('Success', 'Tenant access disabled. Festival data and history are preserved.');
      onComplete();
      onClose();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(`Error: ${error.message}`);
      else Alert.alert('Error', error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Disable access for ${org.name}? This disables tenant access. Festival data and history will be preserved. This action can be reversed.`)) {
        await performDisable();
      }
    } else {
      Alert.alert(
        'Disable Access',
        `Disable access for ${org.name}? This disables tenant access. Festival data and history will be preserved. This action can be reversed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Disable Access', style: 'destructive', onPress: performDisable },
        ]
      );
    }
  };

  const performEnable = async () => {
    try {
      setBusy(true);
      await enableMutation.mutateAsync({ orgId: org.id });
      if (Platform.OS === 'web') window.alert('Tenant access re-enabled.');
      else Alert.alert('Success', 'Tenant access re-enabled.');
      onComplete();
      onClose();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(`Error: ${error.message}`);
      else Alert.alert('Error', error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleEnable = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Re-enable access for ${org.name}? Festival data and history will be preserved.`)) {
        await performEnable();
      }
    } else {
      Alert.alert(
        'Re-enable Access',
        `Re-enable access for ${org.name}? Festival data and history will be preserved.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Re-enable Access', style: 'destructive', onPress: performEnable },
        ]
      );
    }
  };

  const handleResetPassword = async () => {
    const runReset = async () => {
      try {
        setBusy(true);
        const res = await resetMutation.mutateAsync(org.id);
        const loginId = res?.login_identifier || org.admin_email || '—';
        const auditNote = res?.audit_recorded === false ? '\n\nWARNING: the password was reset but the audit record could not be written.' : '';
        const displayMsg = `Password reset successful!\n\nLogin Identifier: ${loginId}\nTemporary password: ${res?.temporary_password}${auditNote}\n\nThis password is shown once and is not stored. Deliver it securely to the admin and ask them to change it.`;
        if (Platform.OS === 'web') {
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(`Login Identifier: ${loginId}\nTemporary password: ${res?.temporary_password}`);
          }
          window.alert(displayMsg);
        } else {
          Alert.alert('Credential reset complete', displayMsg, [
            { text: 'Copy credentials', onPress: () => Clipboard.setString(`Login Identifier: ${loginId}\nTemporary password: ${res?.temporary_password}`) },
            { text: 'Done' },
          ]);
        }
      } catch (error: any) {
        if (Platform.OS === 'web') window.alert(`Error: ${error.message}`);
        else Alert.alert('Error', error.message);
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Reset password for ${org.name}? A new temporary password will be shown once.`)) {
        await runReset();
      }
    } else {
      Alert.alert(
        'Reset Password',
        `Reset password for ${org.name}? A new temporary password will be shown once.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: runReset },
        ]
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}>
        <Animated.View entering={FadeInUp.duration(300)} style={{
          backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          padding: 24, borderTopWidth: 1, borderColor: C.border,
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ backgroundColor: cfg.bg, padding: 10, borderRadius: 12 }}>
                {cfg.icon}
              </View>
              <View>
                <Text style={{ color: C.text, fontFamily: 'Poppins_900Black', fontSize: 18 }}>{org.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {isDisabled ? (
                    <>
                      <ShieldAlert size={12} color={C.danger} />
                      <Text style={{ color: C.danger, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>Disabled Tenant</Text>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={12} color={C.green} />
                      <Text style={{ color: C.green, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>Active Tenant</Text>
                    </>
                  )}
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <X size={22} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Type badge */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            <View style={{ backgroundColor: cfg.bg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: cfg.color + '40' }}>
              <Text style={{ color: cfg.color, fontFamily: 'Poppins_700Bold', fontSize: 12 }}>{cfg.label}</Text>
            </View>
          </View>

          {/* Tenant ID */}
          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Tenant ID</Text>
          <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: C.accent, fontFamily: 'Poppins_400Regular', fontSize: 13, flex: 1, letterSpacing: 0.5 }}>
              {org.tenant_id ?? '—'}
            </Text>
            {org.tenant_id && (
              <TouchableOpacity onPress={handleCopyTenantId} style={{ padding: 4 }}>
                <Copy size={16} color={copiedTenantId ? C.green : C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Email */}
          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Admin Email</Text>
          <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Mail size={16} color={C.muted} />
            <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 15, flex: 1 }}>
              {org.admin_email ?? '—'}
            </Text>
          </View>

          {/* Reset Password */}
            <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
              Admin Password
            </Text>
            <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <KeyRound size={16} color={C.muted} />
              <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 15, flex: 1 }}>
                ••••••••
              </Text>
              {FEATURE_FLAGS.ENABLE_ONBOARDING ? (
                <TouchableOpacity onPress={handleResetPassword} disabled={busy}>
                  <RefreshCw size={18} color={C.muted} />
                </TouchableOpacity>
              ) : (
                <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 11 }}>
                  Unavailable
                </Text>
              )}
            </View>

          {/* Default agent prompt: copy-only, generated by the tenant-create trigger. */}
          <View style={{ backgroundColor: C.purpleBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.purple + '45', marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.purple, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>Leaderboard Agent Prompt</Text>
                <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 3 }}>
                  Default tenant-specific contract · UI editable · backend locked
                </Text>
              </View>
              {promptText && !isDisabled && (
                <TouchableOpacity onPress={handleCopyPrompt} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: copiedPrompt ? C.greenBg : C.surface, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: copiedPrompt ? C.green + '60' : C.purple + '55' }}>
                  <Copy size={14} color={copiedPrompt ? C.green : C.purple} />
                  <Text style={{ color: copiedPrompt ? C.green : C.purple, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>{copiedPrompt ? 'Copied' : 'Copy Prompt'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {promptQuery.isLoading ? (
              <ActivityIndicator color={C.purple} size="small" style={{ alignSelf: 'flex-start', marginTop: 12 }} />
            ) : promptText ? (
              <>
                <TouchableOpacity onPress={() => setShowPrompt((value) => !value)} style={{ marginTop: 10 }}>
                  <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>{showPrompt ? 'Hide prompt' : 'View prompt'}</Text>
                </TouchableOpacity>
                {showPrompt && (
                  <ScrollView style={{ maxHeight: 190, marginTop: 10, backgroundColor: C.bg, borderRadius: 10, padding: 10 }}>
                    <Text selectable style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 10, lineHeight: 16 }}>{promptText}</Text>
                  </ScrollView>
                )}
              </>
            ) : (
              <Text style={{ color: isDisabled ? C.danger : C.muted, fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 10 }}>
                {isDisabled ? 'Prompt access is revoked with this tenant.' : promptQuery.error ? 'Prompt contract is not available until the database migration is applied.' : 'Prompt not generated yet.'}
              </Text>
            )}
          </View>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            {/* Copy Credentials */}
            <TouchableOpacity
              onPress={handleCopy}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: copied ? C.greenBg : C.accentBg, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: copied ? C.green + '50' : C.accent + '50' }}
            >
              <Copy size={16} color={copied ? C.green : C.accent} />
              <Text style={{ color: copied ? C.green : C.accent, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>
                {copied ? 'Copied!' : 'Copy Credentials'}
              </Text>
            </TouchableOpacity>

            {/* Open Login Page */}
            {Platform.OS === 'web' && (
              <TouchableOpacity
                onPress={handleOpenLogin}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.purpleBg, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: C.purple + '50' }}
              >
                <ExternalLink size={16} color={C.purple} />
                <Text style={{ color: C.purple, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>Open Login</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Disable / Re-enable Access Button */}
          <TouchableOpacity
            onPress={isDisabled ? handleEnable : handleDisable}
            disabled={busy}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: isDisabled ? C.greenBg : C.dangerBg,
              padding: 13,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: (isDisabled ? C.green : C.danger) + '50',
              marginBottom: 20,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={isDisabled ? C.green : C.danger} />
            ) : (
              <>
                <ShieldAlert size={16} color={isDisabled ? C.green : C.danger} />
                <Text style={{ color: isDisabled ? C.green : C.danger, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>
                  {isDisabled ? 'Re-enable Access' : 'Disable Access'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Warning */}
          <View style={{ backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.accent + '30', flexDirection: 'row', gap: 8 }}>
            <Info size={16} color={C.accent} style={{ marginTop: 1 }} />
            <Text style={{ color: C.accent, fontFamily: 'Poppins_400Regular', fontSize: 12, flex: 1 }}>
              Use &quot;Open Login&quot; in a new tab to test without losing your superadmin session.
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Onboard Modal ────────────────────────────────────────────────────
function OnboardModal({ visible, onClose, onComplete, org, provisionMutation }: {
  visible: boolean; onClose: () => void; onComplete: () => void; org: Org | null; provisionMutation: any;
}) {
  const [email, setEmail]      = useState('');
  const [phase, setPhase]      = useState<'idle' | 'provisioning' | 'success' | 'failed'>('idle');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [loginIdentifier, setLoginIdentifier] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [festivalTemplate, setFestivalTemplate] = useState<FestivalTemplate>('sahithyolsav');

  useEffect(() => {
    if (visible) {
      setEmail(''); setPhase('idle'); setTempPassword(null); setLoginIdentifier(null); setErrorMsg('');
      setFestivalTemplate('sahithyolsav');
    }
  }, [visible]);

  const handleSave = async () => {
    if (!org) return;
    if (!email.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please enter the admin email.');
      } else {
        Alert.alert('Validation', 'Please enter the admin email.');
      }
      return;
    }
    setErrorMsg('');
    try {
      // Trusted endpoint flow: creates the Auth user server-side, generates a
      // temporary password (returned once, never stored) and finalises the
      // database link transactionally. Success is only claimed after linking.
      setPhase('provisioning');
      const result = await provisionMutation.mutateAsync({
        orgId: org.id,
        orgName: org.name,
        orgType: org.org_type,
        adminEmail: email.trim().toLowerCase(),
        festivalTemplate,
      });
      setPhase('success');
      setTempPassword(result?.temporary_password ?? null);
      setLoginIdentifier(result?.login_identifier ?? email.trim().toLowerCase());
    } catch (error: any) {
      setPhase('failed');
      setErrorMsg(error.message);
    }
  };

  if (!org) return null;

  const renderStatus = () => {
    if (phase === 'provisioning') {
      return (
        <View style={{ alignItems: 'center', paddingVertical: 8, marginBottom: 16 }}>
          <ActivityIndicator color={C.accent} />
          <Text style={{ color: C.text, fontFamily: 'Poppins_600SemiBold', fontSize: 13, marginTop: 10 }}>
            Creating account and linking organisation…
          </Text>
          <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 4 }}>
            Account is only usable after linking completes.
          </Text>
        </View>
      );
    }
    if (phase === 'success') {
      return (
        <View style={{ backgroundColor: C.greenBg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.green + '40', marginBottom: 16 }}>
          <Text style={{ color: C.green, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>Completed — account linked</Text>
          {tempPassword ? (
            <View>
              <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 13, marginTop: 8, lineHeight: 20 }}>
                Login identifier: <Text style={{ fontFamily: 'Poppins_700Bold', color: C.accent }}>{loginIdentifier}</Text>{'\n'}
                Temporary password (shown once): <Text style={{ fontFamily: 'Poppins_700Bold', color: C.accent }}>{tempPassword}</Text>{'\n'}
                <Text style={{ color: C.muted, fontSize: 12 }}>Please deliver it securely. It is not stored anywhere.</Text>
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const credentials = `Login Identifier: ${loginIdentifier}\nTemporary password: ${tempPassword}`;
                  if (Platform.OS === 'web') navigator.clipboard?.writeText(credentials);
                  else Clipboard.setString(credentials);
                }}
                style={{ marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.green + '50' }}
              >
                <Text style={{ color: C.green, fontFamily: 'Poppins_700Bold', fontSize: 12 }}>Copy credentials</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 13, marginTop: 8 }}>
              The account was created previously for this organisation and is already linked.
            </Text>
          )}
        </View>
      );
    }
    if (phase === 'failed') {
      return (
        <View style={{ backgroundColor: C.dangerBg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.danger + '40', marginBottom: 16 }}>
          <Text style={{ color: C.danger, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>Failed safely</Text>
          <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 13, marginTop: 6, lineHeight: 19 }}>
            {errorMsg || 'The provisioning operation failed. No account was left behind — retry below.'}
          </Text>
          <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 6 }}>
            Retrying continues the same safe operation — it will not create a duplicate account.
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}>
        <Animated.View entering={FadeInUp.duration(300)} style={{
          backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          padding: 24, borderTopWidth: 1, borderColor: C.border,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <View>
              <Text style={{ color: C.text, fontFamily: 'Poppins_900Black', fontSize: 20 }}>Onboard Tenant</Text>
              <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 13 }}>
                {org.name} ({getOrgConfig(org.org_type).label})
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}><X size={22} color={C.muted} /></TouchableOpacity>
          </View>

          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Admin Email</Text>
          <TextInput
            value={email} onChangeText={setEmail}
            placeholder="e.g. admin@unit.com" placeholderTextColor={C.muted}
            autoCapitalize="none" keyboardType="email-address"
            editable={phase !== 'provisioning'}
            style={{ backgroundColor: C.bg, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, fontFamily: 'Poppins_400Regular', fontSize: 15, marginBottom: 20 }}
          />

          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Festival Template</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            {([
              { value: 'sahithyolsav', label: 'Sahithyolsav' },
              { value: 'college_fest', label: 'College Fest' },
            ] as { value: FestivalTemplate; label: string }[]).map(option => (
              <TouchableOpacity
                key={option.value}
                onPress={() => setFestivalTemplate(option.value)}
                disabled={phase === 'provisioning'}
                style={{ flex: 1, padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: festivalTemplate === option.value ? C.green : C.border, backgroundColor: festivalTemplate === option.value ? C.greenBg : C.bg }}
              >
                <Text style={{ color: festivalTemplate === option.value ? C.green : C.text, fontFamily: 'Poppins_700Bold', fontSize: 12 }}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>


          <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 12, marginBottom: 20, lineHeight: 18 }}>
            A temporary password is generated by the server and shown once after linking. It is never stored in the database.
          </Text>

          {renderStatus()}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {phase === 'failed' && (
              <TouchableOpacity onPress={handleSave} disabled={provisionMutation.isPending}
                style={{ flex: 1, backgroundColor: C.accentBg, padding: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: C.accent + '50' }}>
                <Text style={{ color: C.accent, fontFamily: 'Poppins_700Bold', fontSize: 15 }}>Retry</Text>
              </TouchableOpacity>
            )}
            {phase !== 'success' && (
              <TouchableOpacity onPress={handleSave} disabled={provisionMutation.isPending || phase === 'provisioning'}
                style={{ flex: 1, backgroundColor: provisionMutation.isPending ? C.border : C.green, padding: 16, borderRadius: 14, alignItems: 'center' }}>
                {provisionMutation.isPending ? <ActivityIndicator color={C.text} /> : (
                  <Text style={{ color: '#000', fontFamily: 'Poppins_700Bold', fontSize: 15 }}>
                    {phase === 'failed' ? 'Retry Creation' : 'Create Tenant Account'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {phase === 'success' && (
              <TouchableOpacity onPress={() => { onComplete(); onClose(); }}
                style={{ flex: 1, backgroundColor: C.green, padding: 16, borderRadius: 14, alignItems: 'center' }}>
                <Text style={{ color: '#000', fontFamily: 'Poppins_700Bold', fontSize: 15 }}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────
export default function TenantsManager() {
  const router = useRouter();
  
  const { useTenantAccounts, useProvisionRootTenant } = useSuperAdmin();
  const { data: orgsData, isLoading: loading, refetch } = useTenantAccounts<Org>();
  const provisionMutation = useProvisionRootTenant();
  const orgs = (orgsData || []).map((o) => ({ ...o, org_type: (String(o.org_type ?? '').trim().toLowerCase() || 'unit') as OrgType }));
  
  const [activeFilter, setActiveFilter] = useState<'all' | OrgType>('all');
  const [onboardOrg, setOnboardOrg]   = useState<Org | null>(null);
  const [detailOrg, setDetailOrg]     = useState<Org | null>(null);

  const fetchOrgs = () => refetch();

  const filteredOrgs = orgs.filter(o => activeFilter === 'all' || o.org_type === activeFilter);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Animated.View entering={FadeInDown.duration(400)} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Header */}
          <View style={{ padding: 20, paddingTop: Platform.OS === 'web' ? 40 : 60 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 10, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                  <ArrowLeft size={20} color={C.text} />
                </TouchableOpacity>
                <View>
                  <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Access Control</Text>
                  <Text style={{ color: C.text, fontFamily: 'Poppins_900Black', fontSize: 22, lineHeight: 26 }}>Tenant Accounts</Text>
                </View>
              </View>
              <TouchableOpacity onPress={fetchOrgs} style={{ padding: 10, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                <RefreshCw size={18} color={C.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 20, backgroundColor: C.surface, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: C.border }}>
              <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 }}>
                Tap <Text style={{ color: C.green }}>Active Tenant</Text> cards to view credentials. Tap <Text style={{ color: C.danger }}>Onboard</Text> to give an organisation portal access.
              </Text>
            </View>
          </View>

          {/* Filter tabs */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(['all', 'state', 'district', 'division', 'sector', 'unit'] as const).map(f => {
                const active = activeFilter === f;
                const cfg = f !== 'all' ? getOrgConfig(f) : null;
                return (
                  <TouchableOpacity key={f} onPress={() => setActiveFilter(f)} style={{
                    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                    borderColor: active ? (cfg?.color ?? C.accent) : C.border,
                    backgroundColor: active ? (cfg?.bg ?? C.accentBg) : C.surface,
                  }}>
                    <Text style={{ color: active ? (cfg?.color ?? C.accent) : C.muted, fontFamily: 'Poppins_700Bold', fontSize: 12, textTransform: 'capitalize' }}>{f}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* List */}
          <View style={{ padding: 20, gap: 12 }}>
            {loading ? (
              <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
            ) : filteredOrgs.length === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 40 }}>
                <Users size={48} color={C.border} />
                <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', marginTop: 16 }}>No organisations found.</Text>
              </View>
            ) : filteredOrgs.map((org, i) => {
              const cfg = getOrgConfig(org.org_type);
              const hasAccess = !!org.tenant_id;
              const isDisabled = org.access_disabled === true;
              const onboardingAllowed = FEATURE_FLAGS.ENABLE_ONBOARDING;
              const rowAction = hasAccess
                ? () => setDetailOrg(org)
                : (onboardingAllowed ? () => setOnboardOrg(org) : undefined);
              return (
                <Animated.View key={org.id} entering={FadeInDown.delay(i * 50).duration(400)}>
                  <TouchableOpacity
                    onPress={rowAction}
                    activeOpacity={rowAction ? 0.8 : 1}
                    style={{ backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: hasAccess ? (isDisabled ? '#F8717130' : '#34D39930') : C.border, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <View style={{ backgroundColor: cfg.bg, padding: 10, borderRadius: 12 }}>{cfg.icon}</View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 16 }}>{org.name}</Text>
                        <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 12 }}>
                          {cfg.label}{org.admin_email ? ` · ${org.admin_email}` : ''}
                        </Text>
                      </View>
                    </View>

                    {hasAccess ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDisabled ? C.dangerBg : C.greenBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: (isDisabled ? C.danger : '#34D399') + '40' }}>
                          {isDisabled ? <ShieldAlert size={12} color={C.danger} /> : <ShieldCheck size={12} color={C.green} />}
                          <Text style={{ color: isDisabled ? C.danger : C.green, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>{isDisabled ? 'Disabled' : 'Active'}</Text>
                        </View>
                        <ChevronRight size={16} color={C.muted} />
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }}>
                        <ShieldAlert size={12} color={C.danger} />
                        <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>
                          {onboardingAllowed ? 'Onboard' : 'Unavailable'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>

      <OnboardModal visible={!!onboardOrg} org={onboardOrg} onClose={() => setOnboardOrg(null)} onComplete={fetchOrgs} provisionMutation={provisionMutation} />
      <DetailModal visible={!!detailOrg} org={detailOrg} onClose={() => setDetailOrg(null)} onComplete={fetchOrgs} />
    </View>
  );
}
