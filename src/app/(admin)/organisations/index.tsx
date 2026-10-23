import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { ui } from '@/constants/designSystem';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, Clipboard } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useOrganisations } from '../../../core/hooks/useOrganisations';
import { ArrowLeft, Plus, Building2, User, Archive, ExternalLink, RefreshCw, RotateCcw, Trash2 } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { FEATURE_FLAGS } from '../../../core/config/features';

export default function SubOrganisationsManager() {
  const router = useRouter();
  
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
                  <Text style={{ color: ui.colors.textMuted, fontFamily: 'Poppins_400Regular', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Hierarchy Management</Text>
                  <Text style={{ color: ui.colors.text, fontFamily: 'Poppins_900Black', fontSize: 22, lineHeight: 26 }}>Teams</Text>
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
                  <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, color: coreColor('#92400E', 'warning') }}>Onboarding temporarily unavailable</Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TouchableOpacity onPress={() => setShowArchived(false)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: !showArchived ? coreColor('#0F766E', 'border') : ui.colors.border, backgroundColor: !showArchived ? ui.colors.successSoft : ui.colors.surface }}>
              <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 12, color: !showArchived ? coreColor('#0F766E', 'primaryText') : ui.colors.textMuted }}>Active ({orgs.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowArchived(true)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: showArchived ? coreColor('#B45309', 'border') : ui.colors.border, backgroundColor: showArchived ? coreColor('#FFFBEB', 'warningSoft') : ui.colors.surface }}>
              <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 12, color: showArchived ? coreColor('#B45309', 'warning') : ui.colors.textMuted }}>Archived ({archivedOrgs.length})</Text>
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 20 }}>
            {(showArchived ? isLoadingArchivedChildren : loading) ? (
              <SsfTableSkeleton rows={6} columns={3} compact />
            ) : (showArchived ? archivedChildOrganisationsError : childOrganisationsError) ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.8 }}>
                <Building2 size={48} color={coreColor("#DC2626", 'danger')} />
                <Text style={{ fontFamily: 'Poppins_400Regular', color: coreColor('#DC2626', 'danger'), marginTop: 16, textAlign: 'center' }}>
                  Unable to load teams. Check your connection and try again.
                </Text>
                <TouchableOpacity
                  onPress={() => showArchived ? refetchArchivedChildOrganisations() : refetchChildOrganisations()}
                  style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: coreColor('#0F766E', 'primary') }}
                >
                  <Text style={{ fontFamily: 'Poppins_700Bold', color: ui.colors.onPrimary }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : listedOrgs.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 }}>
                <Building2 size={48} color={ui.colors.textMuted} />
                <Text style={{ fontFamily: 'Poppins_400Regular', color: ui.colors.textMuted, marginTop: 16 }}>{showArchived ? 'No archived teams.' : 'No teams found.'}</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
                <View style={{ minWidth: 800, flex: 1, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 14, overflow: 'hidden' }}>
                  <View style={{ height: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: coreColor('#F1F5F9', 'surface'), borderBottomWidth: 1, borderBottomColor: ui.colors.border }}>
                    <Text style={{ flex: 1.6, fontFamily: 'Poppins_700Bold', fontSize: 10, color: ui.colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>Team</Text>
                    <Text style={{ flex: 1.5, fontFamily: 'Poppins_700Bold', fontSize: 10, color: ui.colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>Login Username</Text>
                    <Text style={{ width: 100, fontFamily: 'Poppins_700Bold', fontSize: 10, color: ui.colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>Type</Text>
                    <Text style={{ width: 160, textAlign: 'right', fontFamily: 'Poppins_700Bold', fontSize: 10, color: ui.colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>Actions</Text>
                  </View>

                  {listedOrgs.map((org: any) => (
                    <View key={org.id} style={{ minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: coreColor('#E2E8F0', 'border'), backgroundColor: ui.colors.surface }}>
                      <View style={{ flex: 1.6, flexDirection: 'row', alignItems: 'center', paddingRight: 16 }}>
                        <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: ui.colors.successSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                          <Building2 size={15} color={coreColor("#0F766E", 'primaryText')} />
                        </View>
                        <Text numberOfLines={1} style={{ flex: 1, fontFamily: 'Poppins_700Bold', fontSize: 13, color: ui.colors.text }}>{org.name}</Text>
                      </View>
                      <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', paddingRight: 16 }}>
                        <User size={13} color={coreColor("#0F766E", 'primaryText')} />
                        <Text numberOfLines={1} style={{ marginLeft: 7, fontFamily: 'Poppins_400Regular', fontSize: 12, color: ui.colors.textMuted }}>{org.admin_email || '—'}</Text>
                      </View>
                      <View style={{ width: 100, alignItems: 'flex-start' }}>
                        <View style={{ backgroundColor: coreColor('#F1F5F9', 'surface'), borderWidth: 1, borderColor: coreColor('#E2E8F0', 'border'), paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
                          <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 9, color: coreColor('#0F766E', 'primaryText'), textTransform: 'uppercase' }}>{org.org_type || 'UNIT'}</Text>
                        </View>
                      </View>
                      <View style={{ width: 160, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        {!showArchived && FEATURE_FLAGS.ENABLE_ONBOARDING && (
                          <TouchableOpacity
                            onPress={() => handleResetPassword(org)}
                            accessibilityLabel={`Reset Password for ${org.name}`}
                            disabled={isResettingCredential}
                            style={{ width: 34, height: 34, backgroundColor: coreColor('#FEF2F2', 'dangerSoft'), alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: coreColor('#FECACA', 'border') }}
                          >
                            <RefreshCw size={15} color={coreColor("#DC2626", 'danger')} />
                          </TouchableOpacity>
                        )}
                        {!showArchived && <TouchableOpacity
                          onPress={() => router.push(`/unit-profile/${org.id}`)}
                          accessibilityLabel={`Open ${org.name}`}
                          style={{ width: 34, height: 34, backgroundColor: coreColor('#EFF6FF', 'infoSoft'), alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: coreColor('#BFDBFE', 'border') }}
                        >
                          <ExternalLink size={15} color={coreColor("#2563EB", 'info')} />
                        </TouchableOpacity>}
                        {!showArchived && <TouchableOpacity
                          onPress={() => handleArchiveOrg(org)}
                          accessibilityLabel={`Archive ${org.name}`}
                          disabled={isArchiving}
                          style={{ width: 34, height: 34, backgroundColor: coreColor('#FFFBEB', 'warningSoft'), alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: coreColor('#FDE68A', 'border') }}
                        >
                          <Archive size={15} color={coreColor("#B45309", 'warning')} />
                        </TouchableOpacity>}
                        {showArchived && <TouchableOpacity onPress={() => handleRestoreOrg(org)} accessibilityLabel={`Reactivate ${org.name}`} disabled={isRestoring || isDeletingArchived} style={{ width: 34, height: 34, backgroundColor: coreColor('#ECFDF5', 'successSoft'), alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: coreColor('#A7F3D0', 'border') }}>
                          <RotateCcw size={15} color={coreColor("#047857", 'success')} />
                        </TouchableOpacity>}
                        {showArchived && <TouchableOpacity onPress={() => handleDeleteArchivedOrg(org)} accessibilityLabel={`Permanently delete ${org.name}`} disabled={isRestoring || isDeletingArchived} style={{ width: 34, height: 34, backgroundColor: coreColor('#FEF2F2', 'dangerSoft'), alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: coreColor('#FECACA', 'border') }}>
                          <Trash2 size={15} color={coreColor("#DC2626", 'danger')} />
                        </TouchableOpacity>}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: coreAlpha(coreColor('#000000', 'overlay'), 0.6), justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: ui.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
            <Text style={{ fontFamily: 'Poppins_900Black', fontSize: 20, color: ui.colors.text, marginBottom: 20 }}>Create Team</Text>
            
            <Text style={{ color: ui.colors.textMuted, fontFamily: 'Poppins_400Regular', fontSize: 13, marginBottom: 16 }}>
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
            <Text style={{ color: ui.colors.textMuted, fontFamily: 'Poppins_400Regular', fontSize: 11, marginBottom: 16 }}>Use 3–40 lowercase letters, numbers or underscores.</Text>

            {errorMsg ? (
              <Text style={{ color: coreColor('#DC2626', 'danger'), fontFamily: 'Poppins_400Regular', marginBottom: 16, fontSize: 13 }}>⚠️ {errorMsg}</Text>
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
