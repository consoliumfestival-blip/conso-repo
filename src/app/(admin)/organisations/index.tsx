import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { ui } from '@/constants/designSystem';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, Clipboard, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useOrganisations } from '../../../core/hooks/useOrganisations';
import { ArrowLeft, Plus, Building2, User, Archive, ExternalLink, RefreshCw, RotateCcw, Trash2 } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { FEATURE_FLAGS } from '../../../core/config/features';

export default function SubOrganisationsManager() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isPhone = width < 640;
  
  const { 
    childOrganisations: orgs, 
    archivedChildOrganisations: archivedOrgs,
    archivedChildOrganisationsError,
    refetchArchivedChildOrganisations,
    childOrganisationsError,
    refetchChildOrganisations,
    isLoadingChildren: loading, 
    createOrganisation, 
    isCreating, 
    archiveOrganisation,
    isArchiving,
    restoreOrganisation,
    isRestoring,
    deleteArchivedOrganisation,
    isDeletingArchived,
    isLoadingArchivedChildren,
    resetCredential,
    isResettingCredential
  } = useOrganisations();
  const [showArchived, setShowArchived] = useState(false);
  const listedOrgs = showArchived ? archivedOrgs : orgs;

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [attemptKey, setAttemptKey] = useState('');

  // Auto-suggest logic
  useEffect(() => {
    if (!usernameEdited) {
      const suggested = newOrgName
        .trim()
        .toLowerCase()
        .replace(/[\s\-]+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40);
      setNewUsername(suggested);
    }
  }, [newOrgName, usernameEdited]);

  const openCreateModal = () => {
    setNewOrgName('');
    setNewUsername('');
    setUsernameEdited(false);
    setErrorMsg('');
    setAttemptKey(`child-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setModalVisible(true);
  };

  const handleArchiveOrg = (org: any) => {
    const msg = `Archive "${org.name}"? This archives the organisation and preserves participant, registration, result and festival history.`;
    const doArchive = async () => {
      try {
        await archiveOrganisation(org.id);
        if (Platform.OS === 'web') window.alert('Organisation archived. History preserved.');
        else Alert.alert('Success', 'Organisation archived. History preserved.');
      } catch (err: any) {
        if (Platform.OS === 'web') window.alert('Archive failed: ' + err.message);
        else Alert.alert('Error', err.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doArchive();
    } else {
      Alert.alert('Archive Team', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: doArchive },
      ]);
    }
  };

  const handleRestoreOrg = async (org: any) => {
    const message = `Reactivate “${org.name}”? It will be visible in the active organisation list again.`;
    const proceed = Platform.OS === 'web'
      ? window.confirm(message)
      : await new Promise<boolean>((resolve) => Alert.alert('Reactivate team', message, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Reactivate', onPress: () => resolve(true) },
        ]));
    if (!proceed) return;
    try {
      await restoreOrganisation(org.id);
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(`Reactivation failed: ${err.message}`);
      else Alert.alert('Error', err.message);
    }
  };

  const handleDeleteArchivedOrg = async (org: any) => {
    const message = `Permanently delete “${org.name}”? This cannot be undone. The operation will be blocked if the organisation has child organisations or linked records.`;
    const proceed = Platform.OS === 'web'
      ? window.confirm(message)
      : await new Promise<boolean>((resolve) => Alert.alert('Permanently delete', message, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete permanently', style: 'destructive', onPress: () => resolve(true) },
        ]));
    if (!proceed) return;
    try {
      await deleteArchivedOrganisation(org.id);
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(`Delete failed: ${err.message}`);
      else Alert.alert('Delete failed', err.message);
    }
  };

  const handleResetPassword = (org: any) => {
    const msg = `Reset password for "${org.name}"? A new temporary password will be shown once.`;
    const doReset = async () => {
      try {
        const res = await resetCredential(org.id);
        const tempPass = res?.temporary_password;
        const loginId = res?.login_identifier || org.admin_email || '—';
        const auditNote = res?.audit_recorded === false ? '\n\nWARNING: the password was reset but the audit record could not be written.' : '';
        const displayMsg = `Password reset successful!\n\nLogin Identifier: ${loginId}\nTemporary password: ${tempPass}${auditNote}\n\nThis password is shown once and is not stored. Deliver it securely to the admin and ask them to change it.`;
        if (Platform.OS === 'web') {
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(`Login Identifier: ${loginId}\nTemporary password: ${tempPass}`);
          }
          window.alert(displayMsg);
        } else {
          Alert.alert('Credential reset complete', displayMsg, [
            { text: 'Copy credentials', onPress: () => Clipboard.setString(`Login Identifier: ${loginId}\nTemporary password: ${tempPass}`) },
            { text: 'Done' },
          ]);
        }
      } catch (err: any) {
        if (Platform.OS === 'web') window.alert('Reset failed: ' + err.message);
        else Alert.alert('Error', err.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doReset();
    } else {
      Alert.alert('Reset Password', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: doReset },
      ]);
    }
  };

  const handleCreate = async () => {
    if (!newOrgName.trim()) {
      setErrorMsg('Please enter the team name.');
      return;
    }
    
    const normalizedUsername = newUsername.trim().toLowerCase();
    
    if (!normalizedUsername) {
      setErrorMsg('Username must contain 3–40 lowercase letters, numbers or underscores.');
      return;
    }
    if (!/^[a-z0-9_]{3,40}$/.test(normalizedUsername)) {
      setErrorMsg('Username must contain 3–40 lowercase letters, numbers or underscores.');
      return;
    }
    
    setErrorMsg('');

    try {
      const result = await createOrganisation({
        orgName: newOrgName,
        orgType: 'unit',
        username: normalizedUsername,
        idempotencyKey: attemptKey
      });
      setModalVisible(false);
      setNewOrgName('');
      setNewUsername('');
      setUsernameEdited(false);

      const tempPass = result?.temporary_password;
      const loginId = result?.login_identifier || result?.admin_email;
      const displayMsg = `Team created and linked!\n\nLogin Identifier: ${loginId}\nUsername: ${result?.username || normalizedUsername}\nTemporary password: ${tempPass}`;

      if (Platform.OS === 'web') {
        window.alert(displayMsg);
      } else {
        Alert.alert('Team created', `${displayMsg}\n\nThis password is shown once and is not stored.`, [
          { text: 'Copy credentials', onPress: () => Clipboard.setString(`Login Identifier: ${loginId}\nTemporary password: ${tempPass}`) },
          { text: 'Done' },
        ]);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: coreColor('#F8FAFC', 'surface') }}>
      <Animated.View entering={FadeInDown.duration(400)} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          
          <View style={{ padding: 20, paddingTop: Platform.OS === 'web' ? 40 : 60 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 10, backgroundColor: ui.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: coreColor('#E2E8F0', 'border') }}>
                  <ArrowLeft size={20} color={ui.colors.text} />
                </TouchableOpacity>
                <View>
                  <Text style={{ color: ui.colors.textMuted, fontFamily: "Outfit_400Regular", fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Hierarchy Management</Text>
                  <Text style={{ color: ui.colors.text, fontFamily: "Outfit_700Bold", fontSize: 22, lineHeight: 26 }}>Teams</Text>
                </View>
              </View>
              {FEATURE_FLAGS.ENABLE_ONBOARDING ? (
                <SsfButton
                  label="Add New"
                  size="sm"
                  icon={<Plus size={16} color={ui.colors.onPrimary} />}
                  onPress={openCreateModal}
                />
              ) : (
                <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: coreColor('#FDE68A', 'border'), backgroundColor: coreColor('#FFFBEB', 'warningSoft') }}>
                  <Text style={{ fontFamily: "Outfit_500Medium", fontSize: 12, color: coreColor('#92400E', 'warning') }}>Onboarding temporarily unavailable</Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TouchableOpacity onPress={() => setShowArchived(false)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: !showArchived ? coreColor('#0F766E', 'border') : ui.colors.border, backgroundColor: !showArchived ? ui.colors.successSoft : ui.colors.surface }}>
              <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 12, color: !showArchived ? coreColor('#0F766E', 'primaryText') : ui.colors.textMuted }}>Active ({orgs.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowArchived(true)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: showArchived ? coreColor('#B45309', 'border') : ui.colors.border, backgroundColor: showArchived ? coreColor('#FFFBEB', 'warningSoft') : ui.colors.surface }}>
              <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 12, color: showArchived ? coreColor('#B45309', 'warning') : ui.colors.textMuted }}>Archived ({archivedOrgs.length})</Text>
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 20 }}>
            {(showArchived ? isLoadingArchivedChildren : loading) ? (
              <SsfTableSkeleton rows={6} columns={3} compact />
            ) : (showArchived ? archivedChildOrganisationsError : childOrganisationsError) ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.8 }}>
                <Building2 size={48} color={coreColor("#DC2626", 'danger')} />
                <Text style={{ fontFamily: "Outfit_400Regular", color: coreColor('#DC2626', 'danger'), marginTop: 16, textAlign: 'center' }}>
                  Unable to load teams. Check your connection and try again.
                </Text>
                <TouchableOpacity
                  onPress={() => showArchived ? refetchArchivedChildOrganisations() : refetchChildOrganisations()}
                  style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: coreColor('#0F766E', 'primary') }}
                >
                  <Text style={{ fontFamily: "Outfit_700Bold", color: ui.colors.onPrimary }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : listedOrgs.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 }}>
                <Building2 size={48} color={ui.colors.textMuted} />
                <Text style={{ fontFamily: "Outfit_400Regular", color: ui.colors.textMuted, marginTop: 16 }}>{showArchived ? 'No archived teams.' : 'No teams found.'}</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 8 }}>
                {listedOrgs.map((org: any, index: number) => {
                  const accents = [
                    { backgroundColor: coreColor('#ECFDF5', 'successSoft'), borderColor: coreColor('#A7F3D0', 'border'), icon: coreColor('#10B981', 'success') },
                    { backgroundColor: coreColor('#EFF6FF', 'infoSoft'), borderColor: coreColor('#BFDBFE', 'border'), icon: coreColor('#3B82F6', 'info') },
                    { backgroundColor: coreColor('#FFF7ED', 'warningSoft'), borderColor: coreColor('#FED7AA', 'border'), icon: coreColor('#F97316', 'warning') },
                    { backgroundColor: coreColor('#F5F3FF', 'surface'), borderColor: coreColor('#DDD6FE', 'border'), icon: coreColor('#8B5CF6', 'primaryText') },
                  ];
                  const accent = accents[index % accents.length];
                  const actionStyle = (backgroundColor: string, borderColor: string) => ({
                    width: 36,
                    height: 36,
                    backgroundColor,
                    alignItems: 'center' as const,
                    justifyContent: 'center' as const,
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor,
                  });

                  return (
                    <SsfCard key={org.id} style={{
                      width: width < 640 ? '100%' : width < 1200 ? '48.5%' : '31.5%',
                      padding: 14,
                      backgroundColor: accent.backgroundColor,
                      borderColor: accent.borderColor,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: ui.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                          <Building2 size={17} color={accent.icon} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                          <Text numberOfLines={2} style={{ fontFamily: 'Outfit_700Bold', fontSize: 14, lineHeight: 19, color: ui.colors.text }}>{org.name}</Text>
                          <View style={{ alignSelf: 'flex-start', backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
                            <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 9, color: coreColor('#0F766E', 'primaryText'), textTransform: 'uppercase' }}>{org.org_type || 'UNIT'}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: accent.borderColor, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                        <User size={14} color={coreColor('#0F766E', 'primaryText')} />
                        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, marginLeft: 7, fontFamily: 'Outfit_400Regular', fontSize: 12, color: ui.colors.textMuted }}>{org.admin_email || '—'}</Text>
                      </View>

                      <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        {!showArchived && FEATURE_FLAGS.ENABLE_ONBOARDING && (
                          <TouchableOpacity
                            onPress={() => handleResetPassword(org)}
                            accessibilityRole="button"
                            accessibilityLabel={`Reset Password for ${org.name}`}
                            disabled={isResettingCredential}
                            style={actionStyle(coreColor('#FEF2F2', 'dangerSoft'), coreColor('#FECACA', 'border'))}
                          >
                            <RefreshCw size={15} color={coreColor('#DC2626', 'danger')} />
                          </TouchableOpacity>
                        )}
                        {!showArchived && <TouchableOpacity
                          onPress={() => router.push(`/unit-profile/${org.id}`)}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${org.name}`}
                          style={actionStyle(coreColor('#EFF6FF', 'infoSoft'), coreColor('#BFDBFE', 'border'))}
                        >
                          <ExternalLink size={15} color={coreColor('#2563EB', 'info')} />
                        </TouchableOpacity>}
                        {!showArchived && <TouchableOpacity
                          onPress={() => handleArchiveOrg(org)}
                          accessibilityRole="button"
                          accessibilityLabel={`Archive ${org.name}`}
                          disabled={isArchiving}
                          style={actionStyle(coreColor('#FFFBEB', 'warningSoft'), coreColor('#FDE68A', 'border'))}
                        >
                          <Archive size={15} color={coreColor('#B45309', 'warning')} />
                        </TouchableOpacity>}
                        {showArchived && <TouchableOpacity onPress={() => handleRestoreOrg(org)} accessibilityRole="button" accessibilityLabel={`Reactivate ${org.name}`} disabled={isRestoring || isDeletingArchived} style={actionStyle(coreColor('#ECFDF5', 'successSoft'), coreColor('#A7F3D0', 'border'))}>
                          <RotateCcw size={15} color={coreColor('#047857', 'success')} />
                        </TouchableOpacity>}
                        {showArchived && <TouchableOpacity onPress={() => handleDeleteArchivedOrg(org)} accessibilityRole="button" accessibilityLabel={`Permanently delete ${org.name}`} disabled={isRestoring || isDeletingArchived} style={actionStyle(coreColor('#FEF2F2', 'dangerSoft'), coreColor('#FECACA', 'border'))}>
                          <Trash2 size={15} color={coreColor('#DC2626', 'danger')} />
                        </TouchableOpacity>}
                      </View>
                    </SsfCard>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      <Modal visible={modalVisible} transparent animationType={isPhone ? 'slide' : 'fade'} onRequestClose={() => !isCreating && setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: coreAlpha(coreColor('#000000', 'overlay'), 0.6), justifyContent: isPhone ? 'flex-end' : 'center', alignItems: 'center', padding: isPhone ? 0 : 24 }}>
          <View style={{ width: isPhone ? width : Math.min(width - 48, 640), maxHeight: height - (isPhone ? 24 : 48), backgroundColor: ui.colors.surface, borderTopLeftRadius: isPhone ? 24 : 16, borderTopRightRadius: isPhone ? 24 : 16, borderBottomLeftRadius: isPhone ? 0 : 16, borderBottomRightRadius: isPhone ? 0 : 16, padding: isPhone ? 20 : 24, paddingBottom: isPhone && Platform.OS === 'ios' ? 40 : isPhone ? 24 : 24 }}>
            <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 20, color: ui.colors.text, marginBottom: 20 }}>Create Team</Text>
            
            <Text style={{ color: ui.colors.textMuted, fontFamily: "Outfit_400Regular", fontSize: 13, marginBottom: 16 }}>
              Enter the team name and an admin username. A secure admin account and credentials are generated by the server and shown once after linking completes.
            </Text>

            <SsfInput 
              label="Team Name (e.g. Makkaraparamba)"
              value={newOrgName} 
              onChangeText={setNewOrgName} 
              style={{ marginBottom: 16 }}
            />

            <SsfInput
              label="Admin Username (e.g. makkaraparamba_admin)"
              value={newUsername}
              onChangeText={(text) => {
                setNewUsername(text);
                setUsernameEdited(true);
              }}
              autoCapitalize="none"
              style={{ marginBottom: 4 }}
            />
            <Text style={{ color: ui.colors.textMuted, fontFamily: "Outfit_400Regular", fontSize: 11, marginBottom: 16 }}>Use 3–40 lowercase letters, numbers or underscores.</Text>

            {errorMsg ? (
              <Text style={{ color: coreColor('#DC2626', 'danger'), fontFamily: "Outfit_400Regular", marginBottom: 16, fontSize: 13 }}>⚠️ {errorMsg}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <SsfButton 
                label="Cancel" 
                variant="outline" 
                style={{ flex: 1 }} 
                onPress={() => { setModalVisible(false); setErrorMsg(''); setNewOrgName(''); setNewUsername(''); setUsernameEdited(false); }}
                disabled={isCreating}
              />
              <SsfButton 
                label={isCreating ? "Creating account..." : "Create Account"}
                variant="primary" 
                style={{ flex: 1 }} 
                onPress={handleCreate} 
                disabled={isCreating || !newOrgName.trim() || !newUsername.trim()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
